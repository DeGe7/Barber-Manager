import {
  accounts,
  expect,
  loginAs,
  openModule,
  settleMutation,
  test,
  today,
  uniqueName,
} from '../fixtures';

function toDateInputValue(displayDate: string) {
  const [day, month, year] = displayDate.split('/');
  return `${year}-${month}-${day}`;
}

test.describe('mensalidades presenciais', () => {
  test.beforeEach(async ({ page }) => {
    if (!accounts.manager) {
      test.skip(true, 'Requires E2E_MANAGER_EMAIL and E2E_MANAGER_PASSWORD.');
      return;
    }
    await loginAs(page, accounts.manager);
  });

  test('mantém pagamentos, vencimento e estados após recarregar', async ({ page }) => {
    const planName = uniqueName('Plano mensalidade E2E');
    const paidSubscriber = uniqueName('Assinante pago E2E');
    const pendingSubscriber = uniqueName('Assinante pendente E2E');
    const overdueSubscriber = uniqueName('Assinante vencido E2E');
    const paidNote = 'Recebido no balcão pelo gestor';
    const pendingNote = 'Aguardando pagamento no balcão';
    const overdueNote = 'Cobrança presencial pendente';

    await openModule(page, '/planos', 'Planos Disponíveis');

    await page.getByRole('button', { name: 'Novo Plano', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.locator('input').nth(0).fill(planName);
    await dialog.locator('input').nth(1).fill('149');
    await dialog.locator('input').nth(2).fill('4 cortes');
    await dialog.getByRole('button', { name: 'Salvar Plano', exact: true }).click();
    await expect(page.getByText(planName, { exact: true }).first()).toBeVisible();
    await settleMutation(page);

    async function createSubscriber(name: string) {
      await page.getByRole('button', { name: 'Adicionar Assinante', exact: true }).click();
      dialog = page.getByRole('dialog');
      await dialog.locator('input').nth(0).fill(name);
      await dialog.locator('input').nth(1).fill('11955554444');
      await dialog.locator('select').nth(0).selectOption({ label: planName });
      await dialog.locator('select').nth(1).selectOption({ index: 1 });
      await dialog.locator('input[type="date"]').fill(today());
      await dialog.getByRole('button', { name: 'Salvar Assinante', exact: true }).click();
      const row = page.locator('tbody tr').filter({ hasText: name });
      await expect(row).toBeVisible();
      await settleMutation(page);
      return row;
    }

    async function registerPayment(
      row: ReturnType<typeof page.locator>,
      name: string,
      status: 'pago' | 'pendente' | 'vencido',
      note: string,
      dueDate?: string,
    ) {
      await row.getByRole('button', { name: `Registrar mensalidade de ${name}`, exact: true }).click();
      dialog = page.getByRole('dialog');
      await dialog.locator('select').nth(0).selectOption(status);
      if (dueDate) {
        await dialog.locator('input[type="date"]').nth(0).fill(dueDate);
      }
      await dialog.locator('input[type="number"]').fill('149');
      if (status === 'pago') {
        await dialog.locator('input[type="date"]').nth(1).fill(today());
        await dialog.locator('select').nth(1).selectOption('pix');
      }
      await dialog.locator('textarea').fill(note);
      const response = page.waitForResponse(response =>
        response.url().includes('/rest/v1/rpc/set_subscription_payment_status') &&
        response.request().method() === 'POST' &&
        response.ok(),
      );
      await dialog.getByRole('button', { name: 'Salvar controle presencial', exact: true }).click();
      await response;
      await expect(dialog).toBeHidden();
      return row;
    }

    const paidRow = await createSubscriber(paidSubscriber);
    const initialDue = await paidRow.locator('td').nth(2).textContent();
    await registerPayment(paidRow, paidSubscriber, 'pago', paidNote);
    const advancedDue = await paidRow.locator('td').nth(2).textContent();
    expect(advancedDue).not.toBe(initialDue);

    const history = page.locator('section').filter({ hasText: 'Histórico presencial' });
    const paidEntry = history
      .getByText(paidSubscriber, { exact: true })
      .locator('..')
      .locator('..')
      .filter({ hasText: 'Paga' });
    await expect(paidEntry).toBeVisible();
    await expect(paidEntry.getByText('Paga', { exact: true })).toBeVisible();
    await expect(paidEntry.getByText('PIX', { exact: true })).toBeVisible();
    await expect(paidEntry.getByText(/R\$\s*149,00/)).toBeVisible();
    await expect(paidEntry.getByText(paidNote, { exact: true })).toBeVisible();
    const pendingEntry = history
      .getByText(paidSubscriber, { exact: true })
      .locator('..')
      .locator('..')
      .filter({ hasText: 'Pendente' });
    await expect(pendingEntry).toBeVisible();
    await expect(pendingEntry.getByText(/Vencimento:/)).toHaveText(`Vencimento: ${advancedDue?.trim()}`);

    await page.reload();
    await expect(page.locator('main h2').filter({ hasText: 'Planos Disponíveis' })).toBeVisible();
    const reloadedPaidRow = page.locator('tbody tr').filter({ hasText: paidSubscriber });
    await expect(reloadedPaidRow).toBeVisible();
    await expect(reloadedPaidRow.locator('td').nth(2)).not.toHaveText(initialDue ?? '');
    const reloadedHistory = page.locator('section').filter({ hasText: 'Histórico presencial' });
    const reloadedPaidEntry = reloadedHistory
      .getByText(paidSubscriber, { exact: true })
      .locator('..')
      .locator('..')
      .filter({ hasText: 'Paga' });
    await expect(reloadedPaidEntry).toBeVisible();
    await expect(reloadedPaidEntry.getByText(paidNote, { exact: true })).toBeVisible();
    await expect(reloadedPaidEntry.getByText('PIX', { exact: true })).toBeVisible();
    await expect(reloadedPaidEntry.getByText(/R\$\s*149,00/)).toBeVisible();
    const reloadedPendingEntry = reloadedHistory
      .getByText(paidSubscriber, { exact: true })
      .locator('..')
      .locator('..')
      .filter({ hasText: 'Pendente' });
    await expect(reloadedPendingEntry).toBeVisible();
    await expect(reloadedPendingEntry.getByText(/Vencimento:/)).toHaveText(`Vencimento: ${advancedDue?.trim()}`);

    // Retrying the same paid cycle must update that row, not create another
    // paid entry or advance the subscriber to a third cycle.
    await registerPayment(
      reloadedPaidRow,
      paidSubscriber,
      'pago',
      paidNote,
      toDateInputValue(initialDue?.trim() ?? ''),
    );
    const retriedHistory = page.locator('section').filter({ hasText: 'Histórico presencial' });
    const retriedPaidEntries = retriedHistory
      .getByText(paidSubscriber, { exact: true })
      .locator('..')
      .locator('..')
      .filter({ hasText: 'Paga' });
    const retriedPendingEntries = retriedHistory
      .getByText(paidSubscriber, { exact: true })
      .locator('..')
      .locator('..')
      .filter({ hasText: 'Pendente' });
    await expect(retriedPaidEntries).toHaveCount(1);
    await expect(retriedPendingEntries).toHaveCount(1);
    await expect(reloadedPaidRow.locator('td').nth(2)).toHaveText(advancedDue?.trim() ?? '');

    await page.reload();
    await expect(page.locator('main h2').filter({ hasText: 'Planos Disponíveis' })).toBeVisible();
    const persistedPaidRow = page.locator('tbody tr').filter({ hasText: paidSubscriber });
    await expect(persistedPaidRow.locator('td').nth(2)).toHaveText(advancedDue?.trim() ?? '');
    const persistedHistory = page.locator('section').filter({ hasText: 'Histórico presencial' });
    const persistedPaidEntries = persistedHistory
      .getByText(paidSubscriber, { exact: true })
      .locator('..')
      .locator('..')
      .filter({ hasText: 'Paga' });
    const persistedPendingEntries = persistedHistory
      .getByText(paidSubscriber, { exact: true })
      .locator('..')
      .locator('..')
      .filter({ hasText: 'Pendente' });
    await expect(persistedPaidEntries).toHaveCount(1);
    await expect(persistedPendingEntries).toHaveCount(1);

    const pendingRow = await createSubscriber(pendingSubscriber);
    await registerPayment(pendingRow, pendingSubscriber, 'pendente', pendingNote);
    await page.reload();
    const pendingHistory = page.locator('section').filter({ hasText: 'Histórico presencial' });
    const reloadedPendingSubscriberEntry = pendingHistory
      .getByText(pendingSubscriber, { exact: true })
      .locator('..')
      .locator('..');
    await expect(reloadedPendingSubscriberEntry).toBeVisible();
    await expect(reloadedPendingSubscriberEntry.getByText('Pendente', { exact: true })).toBeVisible();
    await expect(reloadedPendingSubscriberEntry.getByText(pendingNote, { exact: true })).toBeVisible();

    const overdueRow = await createSubscriber(overdueSubscriber);
    await registerPayment(overdueRow, overdueSubscriber, 'vencido', overdueNote);
    await page.reload();
    const overdueHistory = page.locator('section').filter({ hasText: 'Histórico presencial' });
    const overdueEntry = overdueHistory
      .getByText(overdueSubscriber, { exact: true })
      .locator('..')
      .locator('..');
    await expect(overdueEntry).toBeVisible();
    await expect(overdueEntry.getByText('Vencida', { exact: true })).toBeVisible();
    await expect(overdueEntry.getByText(overdueNote, { exact: true })).toBeVisible();

    for (const subscriber of [paidSubscriber, pendingSubscriber, overdueSubscriber]) {
      const row = page.locator('tbody tr').filter({ hasText: subscriber });
      await row.getByRole('button', { name: `Excluir assinante ${subscriber}`, exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir', exact: true }).click();
      await expect(page.getByText(subscriber, { exact: true })).toHaveCount(0);
    }
    await page.getByRole('button', { name: `Excluir plano ${planName}`, exact: true }).click();
    await expect(page.getByText(planName, { exact: true })).toHaveCount(0);
  });

  test('exibe avisos de vencimento por período e abre o WhatsApp sem cobrar', async ({ page }) => {
    const monthlyPlanName = uniqueName('Plano avisos mensal E2E');
    const annualPlanName = uniqueName('Plano avisos anual E2E');
    const overdueSubscriber = uniqueName('Aviso atrasado E2E');
    const todaySubscriber = uniqueName('Aviso vence hoje E2E');
    const nextWeekSubscriber = uniqueName('Aviso próxima semana E2E');
    const nextMonthSubscriber = uniqueName('Aviso próximo mês E2E');
    const laterSubscriber = uniqueName('Aviso distante E2E');

    function shiftDays(value: string, amount: number) {
      const [year, month, day] = value.split('-').map(Number);
      const date = new Date(year, month - 1, day, 12, 0, 0, 0);
      date.setDate(date.getDate() + amount);
      const pad = (part: number) => String(part).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function shiftYears(value: string, amount: number) {
      const [year, month, day] = value.split('-').map(Number);
      return `${year + amount}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function parseDisplayedDate(value: string) {
      const [day, month, year] = value.split('/');
      return `${year}-${month}-${day}`;
    }

    function endOfCurrentMonth(value: string) {
      const [year, month] = value.split('-').map(Number);
      const date = new Date(year, month, 0, 12, 0, 0, 0);
      const pad = (part: number) => String(part).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    await openModule(page, '/planos', 'Planos Disponíveis');

    async function createPlan(name: string, duration: 'Mensal' | 'Anual') {
      await page.getByRole('button', { name: 'Novo Plano', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('input').nth(0).fill(name);
      await dialog.locator('input').nth(1).fill('149');
      await dialog.locator('input').nth(2).fill('4 cortes');
      await dialog.locator('select').selectOption({ label: duration });
      await dialog.getByRole('button', { name: 'Salvar Plano', exact: true }).click();
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
      await settleMutation(page);
    }

    const subscribers = [
      { name: overdueSubscriber, planName: monthlyPlanName, startDate: shiftDays(today(), -45) },
      { name: todaySubscriber, planName: annualPlanName, startDate: shiftYears(today(), -1) },
      { name: nextWeekSubscriber, planName: monthlyPlanName, startDate: shiftDays(today(), -25) },
      { name: nextMonthSubscriber, planName: monthlyPlanName, startDate: shiftDays(today(), -10) },
      { name: laterSubscriber, planName: monthlyPlanName, startDate: shiftDays(today(), 35) },
    ];

    await createPlan(monthlyPlanName, 'Mensal');
    await createPlan(annualPlanName, 'Anual');

    async function createSubscriber(name: string, planName: string, startDate: string) {
      await page.getByRole('button', { name: 'Adicionar Assinante', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('input').nth(0).fill(name);
      await dialog.locator('input').nth(1).fill('11955554444');
      await dialog.locator('select').nth(0).selectOption({ label: planName });
      await dialog.locator('select').nth(1).selectOption({ index: 1 });
      await dialog.locator('input[type="date"]').fill(startDate);
      await dialog.getByRole('button', { name: 'Salvar Assinante', exact: true }).click();
      const row = page.locator('tbody tr').filter({ hasText: name });
      await expect(row).toBeVisible();
      await settleMutation(page);
      const dueDate = parseDisplayedDate((await row.locator('td').nth(2).textContent())?.trim() ?? '');
      return { name, dueDate };
    }

    const createdSubscribers: Array<{ name: string; dueDate: string }> = [];
    for (const subscriber of subscribers) {
      createdSubscribers.push(await createSubscriber(
        subscriber.name,
        subscriber.planName,
        subscriber.startDate,
      ));
    }

    const todayValue = today();
    const noticeSection = page.locator('section').filter({
      has: page.locator('select[aria-label="Período dos avisos de vencimento"]'),
    });
    const periodSelect = noticeSection.getByLabel('Período dos avisos de vencimento');
    const periodEnds = {
      '7': shiftDays(todayValue, 7),
      '30': shiftDays(todayValue, 30),
      month: endOfCurrentMonth(todayValue),
      all: '',
    } as const;

    function expectedNames(period: keyof typeof periodEnds) {
      return createdSubscribers
        .filter(({ dueDate }) =>
          dueDate < todayValue ||
          (dueDate >= todayValue && (period === 'all' || dueDate <= periodEnds[period])),
        )
        .sort((a, b) => {
          const aOverdue = a.dueDate < todayValue;
          const bOverdue = b.dueDate < todayValue;
          if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
          return a.dueDate.localeCompare(b.dueDate);
        })
        .map(({ name }) => name);
    }

    async function expectNoticePeriod(period: keyof typeof periodEnds) {
      await periodSelect.selectOption(period);
      const createdNames = new Set(createdSubscribers.map(({ name }) => name));
      const visibleNames = (await noticeSection.locator('p.font-semibold').allTextContents())
        .filter(name => createdNames.has(name));
      expect(visibleNames).toEqual(expectedNames(period));
    }

    await expectNoticePeriod('7');
    await expectNoticePeriod('30');
    await expectNoticePeriod('month');
    await expectNoticePeriod('all');

    const overdueCard = noticeSection.getByText(overdueSubscriber, { exact: true }).locator('xpath=../../..');
    await expect(overdueCard.getByText('Atrasada', { exact: true })).toBeVisible();
    await expect(overdueCard.getByText(/^Atrasada há \d+ dias?$/, { exact: true })).toBeVisible();

    const todayCard = noticeSection.getByText(todaySubscriber, { exact: true }).locator('xpath=../../..');
    await expect(todayCard.getByText('Próxima', { exact: true })).toBeVisible();
    await expect(todayCard.getByText('Vence hoje', { exact: true })).toBeVisible();

    const paymentRpcRequests: string[] = [];
    const recordPaymentRequest = (request: { url(): string }) => {
      if (request.url().includes('/rest/v1/rpc/set_subscription_payment_status')) {
        paymentRpcRequests.push(request.url());
      }
    };
    page.on('request', recordPaymentRequest);
    const whatsappPopup = page.waitForEvent('popup');
    await todayCard.getByRole('button', { name: `Abrir WhatsApp de ${todaySubscriber}`, exact: true }).click();
    const popup = await whatsappPopup;
    const popupUrl = popup.url();
    expect(popupUrl).toContain('https://api.whatsapp.com/send/');
    expect(popupUrl).toContain('phone=5511955554444');
    const encodedMessage = popupUrl.match(/[?&]text=([^&]*)/)?.[1] ?? '';
    expect(decodeURIComponent(encodedMessage.replace(/\+/g, ' '))).toContain(todaySubscriber);
    await popup.close();
    await expect.poll(() => paymentRpcRequests).toHaveLength(0);
    page.off('request', recordPaymentRequest);

    for (const { name } of createdSubscribers) {
      await page.locator('tbody tr').filter({ hasText: name })
        .getByRole('button', { name: `Excluir assinante ${name}`, exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir', exact: true }).click();
      await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    }
    for (const planName of [monthlyPlanName, annualPlanName]) {
      await page.getByRole('button', { name: `Excluir plano ${planName}`, exact: true }).click();
      await expect(page.getByText(planName, { exact: true })).toHaveCount(0);
    }
  });

  test('calcula vencimentos válidos nos limites mensal e trimestral', async ({ page }) => {
    const monthlyPlanName = uniqueName('Plano mensal fim do mês E2E');
    const quarterlyPlanName = uniqueName('Plano trimestral fim do mês E2E');
    const monthlyCases = [
      { day: '29', name: uniqueName('Assinante mensal dia 29 E2E') },
      { day: '30', name: uniqueName('Assinante mensal dia 30 E2E') },
      { day: '31', name: uniqueName('Assinante mensal dia 31 E2E') },
    ];
    const quarterlyCase = {
      name: uniqueName('Assinante trimestral dia 31 E2E'),
      startDate: '2026-08-31',
      initialDue: '2026-11-30',
      nextDue: '2027-02-28',
    };

    await openModule(page, '/planos', 'Planos Disponíveis');

    async function createPlan(name: string, duration: 'Mensal' | 'Trimestral') {
      await page.getByRole('button', { name: 'Novo Plano', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('input').nth(0).fill(name);
      await dialog.locator('input').nth(1).fill('149');
      await dialog.locator('input').nth(2).fill('4 cortes');
      await dialog.locator('select').selectOption({ label: duration });
      await dialog.getByRole('button', { name: 'Salvar Plano', exact: true }).click();
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
      await settleMutation(page);
    }

    async function createSubscriber(name: string, planName: string, startDate: string) {
      await page.getByRole('button', { name: 'Adicionar Assinante', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('input').nth(0).fill(name);
      await dialog.locator('input').nth(1).fill('11955554444');
      await dialog.locator('select').nth(0).selectOption({ label: planName });
      await dialog.locator('select').nth(1).selectOption({ index: 1 });
      await dialog.locator('input[type="date"]').fill(startDate);
      await dialog.getByRole('button', { name: 'Salvar Assinante', exact: true }).click();
      const row = page.locator('tbody tr').filter({ hasText: name });
      await expect(row).toBeVisible();
      await settleMutation(page);
      return row;
    }

    async function registerPaidPayment(row: ReturnType<typeof page.locator>, name: string, amount: string) {
      await row.getByRole('button', { name: `Registrar mensalidade de ${name}`, exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('select').nth(0).selectOption('pago');
      await dialog.locator('input[type="number"]').fill(amount);
      await dialog.locator('input[type="date"]').nth(1).fill(today());
      await dialog.locator('select').nth(1).selectOption('pix');
      const response = page.waitForResponse(response =>
        response.url().includes('/rest/v1/rpc/set_subscription_payment_status') &&
        response.request().method() === 'POST' &&
        response.ok(),
      );
      await dialog.getByRole('button', { name: 'Salvar controle presencial', exact: true }).click();
      await response;
      await expect(dialog).toBeHidden();
    }

    const displayDate = (value: string) => value.split('-').reverse().join('/');
    await createPlan(monthlyPlanName, 'Mensal');
    await createPlan(quarterlyPlanName, 'Trimestral');

    for (const monthlyCase of monthlyCases) {
      const row = await createSubscriber(monthlyCase.name, monthlyPlanName, `2026-01-${monthlyCase.day}`);
      await expect(row.locator('td').nth(2)).toHaveText('28/02/2026');
      await registerPaidPayment(row, monthlyCase.name, '149');
      // The SQL RPC receives the clamped February due date and calculates the
      // next valid cycle from that date.
      await expect(row.locator('td').nth(2)).toHaveText('28/03/2026');
    }

    const quarterlyRow = await createSubscriber(
      quarterlyCase.name,
      quarterlyPlanName,
      quarterlyCase.startDate,
    );
    await expect(quarterlyRow.locator('td').nth(2)).toHaveText(displayDate(quarterlyCase.initialDue));
    await registerPaidPayment(quarterlyRow, quarterlyCase.name, '149');
    await expect(quarterlyRow.locator('td').nth(2)).toHaveText(displayDate(quarterlyCase.nextDue));

    for (const monthlyCase of monthlyCases) {
      const row = page.locator('tbody tr').filter({ hasText: monthlyCase.name });
      await row.getByRole('button', { name: `Excluir assinante ${monthlyCase.name}`, exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir', exact: true }).click();
      await expect(page.getByText(monthlyCase.name, { exact: true })).toHaveCount(0);
    }
    await page.locator('tbody tr').filter({ hasText: quarterlyCase.name })
      .getByRole('button', { name: `Excluir assinante ${quarterlyCase.name}`, exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir', exact: true }).click();
    await expect(page.getByText(quarterlyCase.name, { exact: true })).toHaveCount(0);
    for (const planName of [monthlyPlanName, quarterlyPlanName]) {
      await page.getByRole('button', { name: `Excluir plano ${planName}`, exact: true }).click();
      await expect(page.getByText(planName, { exact: true })).toHaveCount(0);
    }
  });
});