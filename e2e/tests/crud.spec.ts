import {
  accounts,
  expect,
  loginAs,
  openModule,
  requireAccount,
  settleMutation,
  test,
  uniqueName,
  waitForMutation,
  waitForRpcMutation,
} from '../fixtures';

test.describe('CRUD dos módulos de negócio', () => {
  async function createProduct(page: Parameters<typeof loginAs>[0], name: string) {
    await page.getByRole('button', { name: 'Adicionar Produto', exact: true }).click();
    const form = page.locator('form').filter({ hasText: 'Salvar Produto' });
    await form.locator('input').nth(0).fill(name);
    await form.locator('input').nth(1).fill('E2E');
    await form.locator('input').nth(2).fill('20');
    await form.locator('input').nth(3).fill('10');
    await form.locator('input').nth(4).fill('5');
    await form.locator('input').nth(5).fill('1');
    await form.getByRole('button', { name: 'Salvar Produto', exact: true }).click();
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  }

  async function createAttendanceWithProduct(
    page: Parameters<typeof loginAs>[0],
    label: string,
    productCount = 1,
  ) {
    const products = Array.from(
      { length: productCount },
      (_, index) => uniqueName(`Produto ${label}${productCount > 1 ? ` ${index + 1}` : ''}`),
    );
    const client = uniqueName(`Cliente ${label}`);

    await openModule(page, '/produtos', 'Produtos & Estoque');
    for (const product of products) await createProduct(page, product);

    await openModule(page, '/controle', 'Controle Diário');
    const form = page.locator('form').filter({
      has: page.getByRole('button', { name: /^Salvar Atendimento/ }),
    });
    await form.getByTestId('input-attendance-client-name').fill(client);
    await form.locator('select').nth(1).selectOption({ index: 1 });
    await form.getByTestId('input-attendance-service-value').fill('50');
    for (const product of products) {
      await form.getByRole('button', { name: 'Adicionar Produto', exact: true }).click();
      const productOption = form.locator('select').nth(2 + products.indexOf(product))
        .locator('option').filter({ hasText: product });
      await form.locator('select').nth(2 + products.indexOf(product))
        .selectOption((await productOption.getAttribute('value'))!);
    }

    let stockDeductions = 0;
    page.on('response', response => {
      if (
        response.url().includes('/rest/v1/rpc/adjust_product_stock') &&
        response.request().method() === 'POST' &&
        response.request().postDataJSON().p_delta === -1 &&
        response.ok()
      ) stockDeductions += 1;
    });
    const appointmentCreate = waitForMutation(page, 'appointments', 'POST');
    await form.getByRole('button', { name: /^Salvar Atendimento/ }).click();
    await appointmentCreate;
    await expect.poll(() => stockDeductions).toBe(products.length);
    await expect(page.getByRole('row').filter({ hasText: client })).toBeVisible();

    return { client, product: products[0], products };
  }

  async function expectProductStock(
    page: Parameters<typeof loginAs>[0],
    product: string,
    stock: number,
  ) {
    await openModule(page, '/produtos', 'Produtos & Estoque');
    const productRow = page.locator('tbody tr').filter({ hasText: product });
    await expect(productRow).toContainText(`${stock} / min 1`);
  }

  test.beforeEach(async ({ page }) => {
    if (!accounts.manager) {
      test.skip(true, 'Requires E2E_MANAGER_EMAIL and E2E_MANAGER_PASSWORD.');
      return;
    }
    await loginAs(page, accounts.manager);
  });

  test('cria, edita, exclui e recarrega clientes', async ({ page }) => {
    const name = uniqueName('Cliente E2E');
    const editedName = `${name} editado`;
    const phone = `119${Date.now().toString().slice(-8)}`;
    await openModule(page, '/clientes', 'Clientes');
    await page.getByRole('button', { name: 'Novo Cliente', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input').nth(0).fill(name);
    await dialog.locator('input').nth(1).fill(phone);
    await dialog.locator('input').nth(3).fill(`${name.replaceAll(' ', '').toLowerCase()}@example.com`);
    const createResponse = waitForRpcMutation(page, 'create_or_get_client_by_phone');
    await dialog.getByRole('button', { name: 'Salvar Cliente', exact: true }).click();
    await createResponse;
    let clientRow = page.locator('tbody tr').filter({ hasText: name });
    await expect(clientRow).toBeVisible();
    await settleMutation(page);

    await page.getByRole('button', { name: 'Novo Cliente', exact: true }).click();
    const duplicateDialog = page.getByRole('dialog');
    await duplicateDialog.locator('input').nth(0).fill(uniqueName('Cliente duplicado'));
    await duplicateDialog.locator('input').nth(1).fill(phone);
    let duplicateClientRegistrations = 0;
    page.on('request', request => {
      if (request.url().includes('/rest/v1/rpc/create_or_get_client_by_phone') && request.method() === 'POST') {
        duplicateClientRegistrations += 1;
      }
    });
    await duplicateDialog.getByRole('button', { name: 'Salvar Cliente', exact: true }).click();
    await expect(page.getByText('Telefone já cadastrado', { exact: true }).last()).toBeVisible();
    expect(duplicateClientRegistrations).toBe(0);
    await page.keyboard.press('Escape');

    await clientRow.getByRole('button', { name: `Editar ${name}`, exact: true }).click();
    const editDialog = page.getByRole('dialog');
    await editDialog.locator('input').nth(0).fill(editedName);
    const updateResponse = waitForMutation(page, 'clients', 'PATCH');
    await editDialog.getByRole('button', { name: 'Salvar Cliente', exact: true }).click();
    await updateResponse;
    clientRow = page.locator('tbody tr').filter({ hasText: editedName });
    await expect(clientRow).toBeVisible();
    await settleMutation(page);

    await page.reload();
    clientRow = page.locator('tbody tr').filter({ hasText: editedName });
    await expect(clientRow).toBeVisible();
    const deleteResponse = waitForMutation(page, 'clients', 'DELETE');
    await clientRow.getByRole('button', { name: `Excluir ${editedName}`, exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir', exact: true }).click();
    await deleteResponse;
    await expect(page.getByText(editedName, { exact: true })).toHaveCount(0);
  });

  test('cria, edita, exclui e recarrega profissionais', async ({ page }) => {
    const name = uniqueName('Profissional E2E');
    const editedName = `${name} editado`;
    await openModule(page, '/profissionais', 'Equipe');
    await page.getByRole('button', { name: 'Adicionar Profissional', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.locator('input').nth(0).fill(name);
    await dialog.getByRole('button', { name: 'Salvar Profissional', exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await settleMutation(page);

    await page.getByRole('button', { name: `Editar ${name}`, exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('input').nth(0).fill(editedName);
    await dialog.getByRole('button', { name: 'Salvar Profissional', exact: true }).click();
    await expect(page.getByRole('heading', { name: editedName, exact: true })).toBeVisible();
    await settleMutation(page);

    await page.reload();
    await expect(page.getByRole('heading', { name: editedName, exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Excluir ${editedName}`, exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir profissional', exact: true }).click();
    await expect(page.getByRole('heading', { name: editedName, exact: true })).toHaveCount(0);
  });

  test('cria, edita, repõe estoque, exclui e recarrega produtos', async ({ page }) => {
    const name = uniqueName('Produto E2E');
    const editedName = `${name} editado`;
    await openModule(page, '/produtos', 'Produtos & Estoque');
    await page.getByRole('button', { name: 'Adicionar Produto', exact: true }).click();
    const form = page.locator('form').filter({ hasText: 'Salvar Produto' });
    await form.locator('input').nth(0).fill(name);
    await form.locator('input').nth(1).fill('E2E');
    await form.locator('input').nth(2).fill('20');
    await form.locator('input').nth(3).fill('10');
    await form.locator('input').nth(4).fill('3');
    await form.locator('input').nth(5).fill('1');
    await form.getByRole('button', { name: 'Salvar Produto', exact: true }).click();
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    await settleMutation(page);

    const row = page.locator('tr').filter({ hasText: name });
    await row.getByRole('button', { name: `Editar ${name}`, exact: true }).click();
    const editingRow = page.locator('tbody tr').filter({ has: page.locator('button[aria-label="Confirmar edição"]') }).first();
    await editingRow.locator('input').nth(0).fill(editedName);
    await editingRow.getByRole('button', { name: 'Confirmar edição', exact: true }).click();
    await expect(page.getByText(editedName, { exact: true }).first()).toBeVisible();
    await settleMutation(page);

    const editedRow = page.locator('tr').filter({ hasText: editedName });
    await editedRow.locator('input[placeholder="+Qtd"]').fill('2');
    await editedRow.getByRole('button', { name: 'Repor estoque', exact: true }).click();
    await settleMutation(page);
    await page.reload();
    await expect(page.getByText(editedName, { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: `Excluir ${editedName}`, exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir', exact: true }).click();
    await expect(page.getByText(editedName, { exact: true })).toHaveCount(0);
  });

  test('cria, edita, exclui e recarrega um agendamento', async ({ page }) => {
    const client = uniqueName('Agendamento E2E');
    const editedClient = `${client} editado`;
    await openModule(page, '/agenda', 'Agenda');
    await page.getByRole('button', { name: 'Novo Agendamento', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.locator('select').nth(0).selectOption('13:00');
    await dialog.locator('input').nth(0).fill(client);
    await dialog.locator('input').nth(1).fill('11977776666');
    await dialog.locator('input').nth(2).fill('50');
    await dialog.locator('select').nth(1).selectOption({ index: 1 });
    await dialog.getByRole('button', { name: 'Confirmar Agendamento', exact: true }).click();
    await expect(page.getByText(client, { exact: true }).last()).toBeVisible();
    await settleMutation(page);

    await page.getByRole('button', { name: `Editar agendamento de ${client}`, exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('input').nth(0).fill(editedClient);
    await dialog.getByRole('button', { name: 'Salvar Alterações', exact: true }).click();
    await expect(page.getByText(editedClient, { exact: true }).last()).toBeVisible();
    await settleMutation(page);

    await page.reload();
    await expect(page.getByText(editedClient, { exact: true }).last()).toBeVisible();
    await page.getByRole('button', { name: `Excluir agendamento de ${editedClient}`, exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir', exact: true }).click();
    await expect(page.getByText(editedClient, { exact: true })).toHaveCount(0);
  });

  test('cria, edita, exclui e recarrega uma venda de prótese', async ({ page }) => {
    const client = uniqueName('Venda E2E');
    const editedClient = `${client} editado`;
    await openModule(page, '/vendas', 'Vendas & Mentoria');
    const form = page.locator('form').first();
    await form.locator('input').nth(1).fill(client);
    await form.locator('input').nth(2).fill('11966665555');
    await form.locator('input').nth(3).fill('1200');
    await form.locator('select').nth(0).selectOption({ index: 1 });
    await form.getByRole('button', { name: 'Registrar Venda', exact: true }).click();
    await expect(page.getByText(client, { exact: true }).first()).toBeVisible();
    await settleMutation(page);

    await page.getByRole('button', { name: `Editar venda de ${client}`, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input').nth(1).fill(editedClient);
    await dialog.getByRole('button', { name: 'Salvar Alterações', exact: true }).click();
    await expect(page.getByText(editedClient, { exact: true }).first()).toBeVisible();
    await settleMutation(page);

    await page.reload();
    await expect(page.getByText(editedClient, { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: `Excluir venda de ${editedClient}`, exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir', exact: true }).click();
    await expect(page.getByText(editedClient, { exact: true })).toHaveCount(0);
  });

  test('cria, edita, exclui e recarrega uma sessão de mentoria', async ({ page }) => {
    const client = uniqueName('Mentoria E2E');
    const editedClient = `${client} editado`;
    await openModule(page, '/vendas', 'Vendas & Mentoria');
    await page.getByRole('button', { name: 'Mentoria', exact: true }).click();
    const form = page.locator('form').filter({ hasText: 'Agendar Mentoria' });
    await form.locator('select').nth(0).selectOption({ index: 1 });
    await form.locator('input').nth(1).fill(client);
    await form.locator('input').nth(2).fill('450');
    await form.getByRole('button', { name: 'Agendar Mentoria', exact: true }).click();
    await expect(page.getByText(client, { exact: true }).first()).toBeVisible();
    await settleMutation(page);

    await page.getByRole('button', { name: `Editar sessão de ${client}`, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input').nth(1).fill(editedClient);
    await dialog.getByRole('button', { name: 'Salvar Alterações', exact: true }).click();
    await expect(page.getByText(editedClient, { exact: true }).first()).toBeVisible();
    await settleMutation(page);

    await page.reload();
    await page.getByRole('button', { name: 'Mentoria', exact: true }).click();
    await expect(page.getByText(editedClient, { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: `Excluir sessão de ${editedClient}`, exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir', exact: true }).click();
    await expect(page.getByText(editedClient, { exact: true })).toHaveCount(0);
  });

  test('cria, edita, exclui e recarrega um plano', async ({ page }) => {
    const name = uniqueName('Plano E2E');
    const editedName = `${name} editado`;
    await openModule(page, '/planos', 'Planos Disponíveis');
    await page.getByRole('button', { name: 'Novo Plano', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.locator('input').nth(0).fill(name);
    await dialog.locator('input').nth(1).fill('99');
    await dialog.locator('input').nth(2).fill('4 cortes');
    await dialog.getByRole('button', { name: 'Salvar Plano', exact: true }).click();
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    await settleMutation(page);

    await page.getByRole('button', { name: `Editar plano ${name}`, exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('input').nth(0).fill(editedName);
    await dialog.getByRole('button', { name: 'Salvar Plano', exact: true }).click();
    await expect(page.getByText(editedName, { exact: true }).first()).toBeVisible();
    await settleMutation(page);

    await page.reload();
    await expect(page.getByText(editedName, { exact: true }).first()).toBeVisible();

    const subscriber = uniqueName('Assinante E2E');
    const editedSubscriber = `${subscriber} editado`;
    await page.getByRole('button', { name: 'Adicionar Assinante', exact: true }).click();
    let subscriberDialog = page.getByRole('dialog');
    await subscriberDialog.locator('input').nth(0).fill(subscriber);
    await subscriberDialog.locator('input').nth(1).fill('11955554444');
    await subscriberDialog.locator('select').nth(0).selectOption({ label: editedName });
    await subscriberDialog.locator('select').nth(1).selectOption({ index: 1 });
    await subscriberDialog.getByRole('button', { name: 'Salvar Assinante', exact: true }).click();
    let subscriberRow = page.locator('tbody tr').filter({ hasText: subscriber });
    await expect(subscriberRow).toBeVisible();
    await settleMutation(page);

    await subscriberRow.getByRole('button', { name: `Editar assinante ${subscriber}`, exact: true }).click();
    subscriberDialog = page.getByRole('dialog');
    await subscriberDialog.locator('input').nth(0).fill(editedSubscriber);
    await subscriberDialog.getByRole('button', { name: 'Salvar Assinante', exact: true }).click();
    subscriberRow = page.locator('tbody tr').filter({ hasText: editedSubscriber });
    await expect(subscriberRow).toBeVisible();
    await settleMutation(page);

    await page.reload();
    subscriberRow = page.locator('tbody tr').filter({ hasText: editedSubscriber });
    await expect(subscriberRow).toBeVisible();
    await subscriberRow.getByRole('button', { name: `Excluir assinante ${editedSubscriber}`, exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir', exact: true }).click();
    await expect(page.getByText(editedSubscriber, { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: `Excluir plano ${editedName}`, exact: true }).click();
    await expect(page.getByText(editedName, { exact: true })).toHaveCount(0);
  });

  test('cria e exclui lançamentos de receitas e despesas no financeiro', async ({ page }) => {
    const income = uniqueName('Receita E2E');
    const expense = uniqueName('Despesa E2E');
    await openModule(page, '/financeiro', 'Financeiro');

    await page.getByRole('button', { name: 'Lançar receita manual', exact: true }).click();
    let dialog = page.getByRole('dialog');
    const incomeResponse = waitForMutation(page, 'incomes', 'POST');
    await dialog.locator('input').nth(1).fill(income);
    await dialog.locator('input').nth(2).fill('321');
    await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
    await incomeResponse;
    await expect(page.getByText(income, { exact: true }).first()).toBeVisible();
    await settleMutation(page);

    await page.getByRole('button', { name: 'Lançar despesa', exact: true }).click();
    dialog = page.getByRole('dialog');
    const expenseResponse = waitForMutation(page, 'expenses', 'POST');
    await dialog.locator('input').nth(1).fill(expense);
    await dialog.locator('input').nth(2).fill('123');
    await dialog.getByLabel('Forma de pagamento da despesa').selectOption('pix');
    await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expenseResponse;
    await expect(page.getByText(expense, { exact: false }).last()).toBeVisible();
    await settleMutation(page);

    await page.reload();
    await expect(page.getByText(income, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(expense, { exact: false }).last()).toBeVisible();

    const editedIncome = `${income} editada`;
    const incomeRow = page.locator('p.text-sm.font-medium').filter({ hasText: income });
    const incomeUpdateResponse = waitForMutation(page, 'incomes', 'PATCH');
    await incomeRow.locator('xpath=ancestor::div[.//button[@aria-label="Editar lançamento"]][1]')
      .getByRole('button', { name: 'Editar lançamento' }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.locator('input').nth(0)).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    await expect(dialog.locator('input').nth(1)).toHaveValue(income);
    await expect(dialog.locator('input').nth(2)).toHaveValue('321');
    await dialog.locator('input').nth(1).fill(editedIncome);
    await dialog.locator('input').nth(2).fill('456');
    await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    await incomeUpdateResponse;
    await expect(page.getByText(editedIncome, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(income, { exact: true })).toHaveCount(0);
    await settleMutation(page);

    const editedExpense = `${expense} editada`;
    const expenseRow = page.locator('p.text-sm.font-medium').filter({ hasText: expense });
    const expenseUpdateResponse = waitForMutation(page, 'expenses', 'PATCH');
    await expenseRow.locator('xpath=ancestor::div[.//button[@aria-label="Editar lançamento"]][1]')
      .getByRole('button', { name: 'Editar lançamento' }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.locator('input').nth(0)).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    await expect(dialog.getByLabel('Categoria da despesa')).toHaveValue('Outros');
    await expect(dialog.getByLabel('Forma de pagamento da despesa')).toHaveValue('pix');
    await expect(dialog.locator('input').nth(1)).toHaveValue(expense);
    await expect(dialog.locator('input').nth(2)).toHaveValue('123');
    await dialog.locator('input').nth(1).fill(editedExpense);
    await dialog.locator('input').nth(2).fill('234');
    await dialog.getByLabel('Categoria da despesa').selectOption({ label: 'Marketing' });
    await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    await expenseUpdateResponse;
    await expect(page.getByText(`${editedExpense} · Marketing · PIX`, { exact: true }).last()).toBeVisible();
    await settleMutation(page);

    await page.reload();
    await expect(page.getByText(editedIncome, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`${editedExpense} · Marketing · PIX`, { exact: true }).last()).toBeVisible();

    await page.getByRole('button', { name: 'Ver histórico financeiro', exact: true }).click();
    const historyDialog = page.getByRole('dialog');
    await expect(historyDialog).toContainText('Histórico de alterações financeiras');
    await expect(historyDialog).toContainText(income);
    await expect(historyDialog).toContainText(editedIncome);
    await expect(historyDialog).toContainText(expense);
    await expect(historyDialog).toContainText(editedExpense);
    await historyDialog.getByRole('button', { name: 'Close', exact: false }).click();

    const incomeItem = page.locator('p.text-sm.font-medium').filter({ hasText: editedIncome })
      .locator('xpath=ancestor::div[.//button[@aria-label="Excluir lançamento"]][1]');
    const incomeDeleteResponse = waitForMutation(page, 'incomes', 'DELETE');
    await incomeItem.getByRole('button', { name: 'Excluir lançamento', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir', exact: true }).click();
    await incomeDeleteResponse;
    const expenseItem = page.locator('p.text-sm.font-medium').filter({ hasText: editedExpense })
      .locator('xpath=ancestor::div[.//button[@aria-label="Excluir lançamento"]][1]');
    const expenseDeleteResponse = waitForMutation(page, 'expenses', 'DELETE');
    await expenseItem.getByRole('button', { name: 'Excluir lançamento', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir', exact: true }).click();
    await expenseDeleteResponse;
    await expect(page.getByText(editedIncome, { exact: true })).toHaveCount(0);
    await expect(page.getByText(editedExpense, { exact: false })).toHaveCount(0);
  });

  test('valida pagamento dividido antes de alterar estoque', async ({ page }) => {
    const product = uniqueName('Produto split E2E');
    await openModule(page, '/produtos', 'Produtos & Estoque');
    await page.getByRole('button', { name: 'Adicionar Produto', exact: true }).click();
    const productForm = page.locator('form').filter({ hasText: 'Salvar Produto' });
    await productForm.locator('input').nth(0).fill(product);
    await productForm.locator('input').nth(2).fill('20');
    await productForm.locator('input').nth(3).fill('10');
    await productForm.locator('input').nth(4).fill('5');
    await productForm.locator('input').nth(5).fill('1');
    const productResponse = page.waitForResponse(response =>
      response.url().includes('/rest/v1/products') &&
      response.request().method() === 'POST' &&
      response.ok(),
    );
    await productForm.getByRole('button', { name: 'Salvar Produto', exact: true }).click();
    await productResponse;
    await settleMutation(page);

    await openModule(page, '/controle', 'Controle Diário');
    const form = page.locator('form').filter({ has: page.getByRole('button', { name: /^Salvar Atendimento/ }) });
    await form.getByTestId('input-attendance-client-name').fill(uniqueName('Cliente split'));
    await form.locator('select').nth(1).selectOption({ index: 1 });
    await form.getByTestId('input-attendance-service-value').fill('10');
    await form.getByRole('button', { name: 'Adicionar Produto', exact: true }).click();
    const productOption = form.locator('select').nth(2).locator('option').filter({ hasText: product });
    const productId = await productOption.getAttribute('value');
    await form.locator('select').nth(2).selectOption(productId!);
    await form.locator('input[type="number"]').nth(2).fill('1');
    await form.getByRole('button', { name: '+ Adicionar Forma de Pagamento', exact: true }).click();
    await form.getByRole('button', { name: '+ Adicionar Forma de Pagamento', exact: true }).click();
    await form.getByLabel('Valor da forma 1').fill('5');
    await form.getByLabel('Valor da forma 2').fill('1');
    await form.getByRole('button', { name: /^Salvar Atendimento/ }).click();
    await expect(page.getByText(/formas de pagamento devem totalizar/i)).toBeVisible();
    await openModule(page, '/produtos', 'Produtos & Estoque');
    await expect(page.locator('tr').filter({ hasText: product })).toContainText('5 / min 1');
    await page.getByRole('button', { name: `Excluir ${product}`, exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir', exact: true }).click();
  });

  test('reutiliza o cliente quando o telefone já está cadastrado e mantém as visitas vinculadas', async ({ page }) => {
    const clientName = uniqueName('Cliente pelo atendimento');
    const secondEnteredName = uniqueName('Nome alternativo');
    const phone = `119${Date.now().toString().slice(-8)}`;

    await openModule(page, '/controle', 'Controle Diário');
    const form = page.locator('form').filter({
      has: page.getByRole('button', { name: /^Salvar Atendimento/ }),
    });
    const fillAttendance = async (name: string) => {
      await form.getByTestId('input-attendance-client-name').fill(name);
      await form.getByTestId('input-attendance-client-phone').fill(phone);
      await form.locator('select').nth(1).selectOption({ index: 1 });
      await form.getByTestId('input-attendance-service-value').fill('75');
    };

    await fillAttendance(clientName);
    const clientCreate = waitForRpcMutation(page, 'create_or_get_client_by_phone');
    const firstAppointment = waitForMutation(page, 'appointments', 'POST');
    await form.getByRole('button', { name: /^Salvar Atendimento/ }).click();
    const [firstClientResponse, firstAppointmentResponse] = await Promise.all([clientCreate, firstAppointment]);
    const originalClient = await firstClientResponse.json() as { id: string };
    const originalAppointment = await firstAppointmentResponse.json() as { client_id: string };
    expect(originalAppointment.client_id).toBe(originalClient.id);
    await expect(page.getByText('Atendimento registrado e incluído no histórico do cliente!', { exact: true })).toBeVisible();

    await openModule(page, '/clientes', 'Clientes');
    await expect(page.getByText(clientName, { exact: true })).toBeVisible();
    await expect(page.getByText(phone, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Ver ficha de ${clientName}`, exact: true }).click();
    let clientDialog = page.getByRole('dialog');
    await expect(clientDialog).toContainText('Total Visitas');
    await expect(clientDialog.getByText('1', { exact: true })).toBeVisible();
    await expect(clientDialog).toContainText('Barbearia');
    await page.keyboard.press('Escape');

    await openModule(page, '/controle', 'Controle Diário');
    const secondForm = page.locator('form').filter({
      has: page.getByRole('button', { name: /^Salvar Atendimento/ }),
    });
    await fillAttendance(secondEnteredName);
    await expect(secondForm.getByTestId('input-attendance-client-phone')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(secondForm.getByTestId('status-attendance-client-phone-duplicate')).toHaveText('Cliente existente será reutilizado');
    let clientRegistrationCalls = 0;
    page.on('request', request => {
      if (
        request.url().includes('/rest/v1/rpc/create_or_get_client_by_phone') &&
        request.method() === 'POST'
      ) clientRegistrationCalls += 1;
    });
    const secondClientCreate = waitForRpcMutation(page, 'create_or_get_client_by_phone');
    const secondAppointment = waitForMutation(page, 'appointments', 'POST');
    await secondForm.getByRole('button', { name: /^Salvar Atendimento/ }).click();
    const [reusedClientResponse, secondAppointmentResponse] = await Promise.all([secondClientCreate, secondAppointment]);
    const reusedClient = await reusedClientResponse.json() as { id: string };
    const savedSecondAppointment = await secondAppointmentResponse.json() as { client_id: string };
    expect(reusedClient.id).toBe(originalClient.id);
    expect(savedSecondAppointment.client_id).toBe(originalClient.id);
    expect(clientRegistrationCalls).toBe(1);
    await expect(page.getByText('Atendimento registrado e vinculado ao cliente existente.', { exact: true })).toBeVisible();

    await openModule(page, '/clientes', 'Clientes');
    await expect(page.getByText(clientName, { exact: true })).toBeVisible();
    await expect(page.getByText(secondEnteredName, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: `Ver ficha de ${clientName}`, exact: true }).click();
    clientDialog = page.getByRole('dialog');
    await expect(clientDialog.getByText('2', { exact: true })).toBeVisible();
  });

  test('dois atendimentos simultâneos com o mesmo telefone usam um cliente só', async ({ page }) => {
    const secondPage = await page.context().newPage();
    const firstName = uniqueName('Atendimento simultâneo A');
    const secondName = uniqueName('Atendimento simultâneo B');
    const phone = `119${Date.now().toString().slice(-8)}`;

    try {
      await Promise.all([
        openModule(page, '/controle', 'Controle Diário'),
        openModule(secondPage, '/controle', 'Controle Diário'),
      ]);

      const firstForm = page.locator('form').filter({
        has: page.getByRole('button', { name: /^Salvar Atendimento/ }),
      });
      const secondForm = secondPage.locator('form').filter({
        has: secondPage.getByRole('button', { name: /^Salvar Atendimento/ }),
      });
      for (const [form, name] of [[firstForm, firstName], [secondForm, secondName]] as const) {
        await form.getByTestId('input-attendance-client-name').fill(name);
        await form.getByTestId('input-attendance-client-phone').fill(phone);
        await form.locator('select').nth(1).selectOption({ index: 1 });
        await form.getByTestId('input-attendance-service-value').fill('75');
      }

      const firstRegistration = waitForRpcMutation(page, 'create_or_get_client_by_phone');
      const secondRegistration = waitForRpcMutation(secondPage, 'create_or_get_client_by_phone');
      const firstAppointment = waitForMutation(page, 'appointments', 'POST');
      const secondAppointment = waitForMutation(secondPage, 'appointments', 'POST');
      await Promise.all([
        firstForm.getByRole('button', { name: /^Salvar Atendimento/ }).click(),
        secondForm.getByRole('button', { name: /^Salvar Atendimento/ }).click(),
      ]);

      const [firstClientResponse, secondClientResponse, firstAppointmentResponse, secondAppointmentResponse] =
        await Promise.all([firstRegistration, secondRegistration, firstAppointment, secondAppointment]);
      const [firstClient, secondClient] = await Promise.all([
        firstClientResponse.json() as Promise<{ id: string }>,
        secondClientResponse.json() as Promise<{ id: string }>,
      ]);
      const [firstSavedAppointment, secondSavedAppointment] = await Promise.all([
        firstAppointmentResponse.json() as Promise<{ client_id: string }>,
        secondAppointmentResponse.json() as Promise<{ client_id: string }>,
      ]);

      expect(secondClient.id).toBe(firstClient.id);
      expect(firstSavedAppointment.client_id).toBe(firstClient.id);
      expect(secondSavedAppointment.client_id).toBe(firstClient.id);

      await openModule(page, '/clientes', 'Clientes');
      await page.reload();
      const matchingClientRow = page.locator('tbody tr').filter({ hasText: phone });
      await expect(matchingClientRow).toHaveCount(1);
      await matchingClientRow.getByRole('button', { name: /^Ver ficha de/ }).click();
      await expect(page.getByRole('dialog').getByText('2', { exact: true })).toBeVisible();
    } finally {
      await secondPage.close();
    }
  });

  test('busca cliente por nome ou telefone e vincula atendimento e visita ao cadastro', async ({ page }) => {
    const clientName = uniqueName('Cliente selecionado');
    const phone = `119${Date.now().toString().slice(-8)}`;

    await openModule(page, '/clientes', 'Clientes');
    await page.getByRole('button', { name: 'Novo Cliente', exact: true }).click();
    const clientDialog = page.getByRole('dialog');
    await clientDialog.locator('input').nth(0).fill(clientName);
    await clientDialog.locator('input').nth(1).fill(phone);
    await clientDialog.locator('input').nth(3).fill(`${clientName.replaceAll(' ', '').toLowerCase()}@example.com`);
    const createClientResponse = waitForRpcMutation(page, 'create_or_get_client_by_phone');
    await clientDialog.getByRole('button', { name: 'Salvar Cliente', exact: true }).click();
    const createdClient = await (await createClientResponse).json() as { id: string };

    await openModule(page, '/controle', 'Controle Diário');
    const form = page.locator('form').filter({
      has: page.getByRole('button', { name: /^Salvar Atendimento/ }),
    });
    const search = form.getByTestId('input-attendance-client-search');
    await search.fill(clientName);
    const result = form.getByTestId(`button-select-attendance-client-${createdClient.id}`);
    await expect(result).toBeVisible();
    await search.fill(phone);
    await expect(result).toBeVisible();
    await result.click();
    await expect(form.getByTestId('input-attendance-client-name')).toHaveValue(clientName);
    await expect(form.getByTestId('input-attendance-client-phone')).toHaveValue(phone);
    await form.locator('select').nth(1).selectOption({ index: 1 });
    await form.getByTestId('input-attendance-service-value').fill('75');

    const clientVisitResponse = waitForMutation(page, 'clients', 'PATCH');
    const appointmentResponse = waitForMutation(page, 'appointments', 'POST');
    await form.getByRole('button', { name: /^Salvar Atendimento/ }).click();
    const [visitResponse, savedAppointmentResponse] = await Promise.all([
      clientVisitResponse,
      appointmentResponse,
    ]);
    const visitPayload = visitResponse.request().postDataJSON() as {
      visits: Array<{ type: string; description: string; amount: number }>;
    };
    expect(visitPayload.visits).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'servico', description: 'Barbearia', amount: 75 }),
    ]));
    const savedAppointment = await savedAppointmentResponse.json() as { client_id: string };
    expect(savedAppointment.client_id).toBe(createdClient.id);
    await expect(page.getByText('Atendimento registrado e incluído no histórico do cliente!', { exact: true })).toBeVisible();
  });

  test('cancela o atendimento quando não consegue salvar o cliente em Clientes', async ({ page }) => {
    const clientName = uniqueName('Cliente não salvo');
    const phone = `119${Date.now().toString().slice(-8)}`;
    await openModule(page, '/controle', 'Controle Diário');
    const form = page.locator('form').filter({
      has: page.getByRole('button', { name: /^Salvar Atendimento/ }),
    });
    await form.getByTestId('input-attendance-client-name').fill(clientName);
    await form.getByTestId('input-attendance-client-phone').fill(phone);
    await form.locator('select').nth(1).selectOption({ index: 1 });
    await form.getByTestId('input-attendance-service-value').fill('75');

    let appointmentRequests = 0;
    page.on('request', request => {
      if (request.url().includes('/rest/v1/appointments') && request.method() === 'POST') {
        appointmentRequests += 1;
      }
    });
    await page.route('**/rest/v1/rpc/create_or_get_client_by_phone*', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'falha simulada ao salvar cliente' }),
        });
        return;
      }
      await route.continue();
    });

    await form.getByRole('button', { name: /^Salvar Atendimento/ }).click();
    await expect(page.getByText('Atendimento não registrado: não foi possível salvar o cliente.', { exact: true })).toBeVisible();
    expect(appointmentRequests).toBe(0);
    await expect(form.getByTestId('input-attendance-client-name')).toHaveValue(clientName);
    await page.unroute('**/rest/v1/rpc/create_or_get_client_by_phone*');
  });

  test('mantém o formulário aberto e não confirma receita quando o Supabase falha', async ({ page }) => {
    const income = uniqueName('Receita rejeitada E2E');
    await openModule(page, '/financeiro', 'Financeiro');
    await page.route('**/rest/v1/incomes*', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'falha simulada do teste' }),
      }),
    );

    await page.getByRole('button', { name: 'Lançar receita manual', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input').nth(1).fill(income);
    await dialog.locator('input').nth(2).fill('321');
    await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();

    await expect(page.getByText('Erro ao salvar receita', { exact: true }).last()).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('input').nth(1)).toHaveValue(income);
    await expect(dialog.locator('input').nth(2)).toHaveValue('321');
    await expect(page.getByText(income, { exact: true })).toHaveCount(0);
    await page.unroute('**/rest/v1/incomes*');
  });

  test('mantém o lançamento original quando a edição é rejeitada pelo Supabase', async ({ page }) => {
    const income = uniqueName('Receita edição rejeitada E2E');
    const editedIncome = `${income} editada`;
    await openModule(page, '/financeiro', 'Financeiro');

    await page.getByRole('button', { name: 'Lançar receita manual', exact: true }).click();
    let dialog = page.getByRole('dialog');
    const createResponse = waitForMutation(page, 'incomes', 'POST');
    await dialog.locator('input').nth(1).fill(income);
    await dialog.locator('input').nth(2).fill('321');
    await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
    await createResponse;
    await expect(page.getByText(income, { exact: true }).first()).toBeVisible();
    await settleMutation(page);

    await page.route('**/rest/v1/incomes*', async route => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'falha simulada na edição' }),
        });
        return;
      }
      await route.continue();
    });

    const incomeRow = page.locator('p.text-sm.font-medium').filter({ hasText: income });
    await incomeRow.locator('xpath=ancestor::div[.//button[@aria-label="Editar lançamento"]][1]')
      .getByRole('button', { name: 'Editar lançamento' }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.locator('input').nth(1)).toHaveValue(income);
    await expect(dialog.locator('input').nth(2)).toHaveValue('321');
    await dialog.locator('input').nth(1).fill(editedIncome);
    await dialog.locator('input').nth(2).fill('654');
    await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click();

    await expect(page.getByText('Erro ao atualizar receita', { exact: true }).last()).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('input').nth(1)).toHaveValue(editedIncome);
    await expect(dialog.locator('input').nth(2)).toHaveValue('654');
    await expect(page.getByText(income, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(editedIncome, { exact: true })).toHaveCount(0);

    await page.unroute('**/rest/v1/incomes*');
    const updateResponse = waitForMutation(page, 'incomes', 'PATCH');
    await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    await updateResponse;
    await expect(page.getByText(editedIncome, { exact: true }).first()).toBeVisible();

    const incomeItem = page.locator('p.text-sm.font-medium').filter({ hasText: editedIncome })
      .locator('xpath=ancestor::div[.//button[@aria-label="Excluir lançamento"]][1]');
    const deleteResponse = waitForMutation(page, 'incomes', 'DELETE');
    await incomeItem.getByRole('button', { name: 'Excluir lançamento', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir', exact: true }).click();
    await deleteResponse;
    await expect(page.getByText(editedIncome, { exact: true })).toHaveCount(0);
  });

  test('reverte baixas de estoque se uma etapa do atendimento falhar', async ({ page }) => {
    const firstProduct = uniqueName('Produto rollback A');
    const secondProduct = uniqueName('Produto rollback B');
    await openModule(page, '/produtos', 'Produtos & Estoque');
    await createProduct(page, firstProduct);
    await createProduct(page, secondProduct);

    await openModule(page, '/controle', 'Controle Diário');
    const form = page.locator('form').filter({ has: page.getByRole('button', { name: /^Salvar Atendimento/ }) });
    await form.getByTestId('input-attendance-client-name').fill(uniqueName('Cliente rollback'));
    await form.locator('select').nth(1).selectOption({ index: 1 });
    await form.getByTestId('input-attendance-service-value').fill('50');
    await form.getByRole('button', { name: 'Adicionar Produto', exact: true }).click();
    await form.getByRole('button', { name: 'Adicionar Produto', exact: true }).click();
    const productSelects = form.locator('select');
    const firstOption = productSelects.nth(2).locator('option').filter({ hasText: firstProduct });
    const secondOption = productSelects.nth(3).locator('option').filter({ hasText: secondProduct });
    await productSelects.nth(2).selectOption((await firstOption.getAttribute('value'))!);
    await productSelects.nth(3).selectOption((await secondOption.getAttribute('value'))!);
    const quantities = form.locator('input[type="number"]');
    await quantities.nth(2).fill('1');
    await quantities.nth(3).fill('1');

    let stockCalls = 0;
    await page.route('**/rest/v1/rpc/adjust_product_stock', async route => {
      stockCalls += 1;
      if (stockCalls === 2) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'falha simulada de estoque' }),
        });
        return;
      }
      await route.continue();
    });

    await form.getByRole('button', { name: /^Salvar Atendimento/ }).click();
    await expect(page.getByText('Erro ao atualizar estoque', { exact: true }).last()).toBeVisible();
    await expect.poll(() => stockCalls).toBe(3);

    await page.unroute('**/rest/v1/rpc/adjust_product_stock');
    await openModule(page, '/produtos', 'Produtos & Estoque');
    await page.reload();
    await expect(page.locator('tr').filter({ hasText: firstProduct })).toContainText('5 / min 1');
    await expect(page.locator('tr').filter({ hasText: secondProduct })).toContainText('5 / min 1');
  });

  test('cancelar a confirmação preserva o atendimento e não repõe o estoque', async ({ page }) => {
    const { client, product } = await createAttendanceWithProduct(page, 'exclusão cancelada');
    await expectProductStock(page, product, 4);
    await openModule(page, '/controle', 'Controle Diário');

    let appointmentDeletes = 0;
    let stockRestocks = 0;
    page.on('request', request => {
      if (
        request.url().includes('/rest/v1/appointments') &&
        request.method() === 'DELETE'
      ) appointmentDeletes += 1;
      if (
        request.url().includes('/rest/v1/rpc/adjust_product_stock') &&
        request.method() === 'POST' &&
        request.postDataJSON().p_delta > 0
      ) stockRestocks += 1;
    });

    await page.getByRole('button', { name: `Excluir atendimento de ${client}`, exact: true }).click();
    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(confirmation).toBeHidden();
    await expect(page.getByText(client, { exact: true })).toBeVisible();
    expect(appointmentDeletes).toBe(0);
    expect(stockRestocks).toBe(0);

    await expectProductStock(page, product, 4);
  });

  test('excluir atendimento remove o lançamento e repõe os produtos vinculados', async ({ page }) => {
    const { client, products } = await createAttendanceWithProduct(page, 'exclusão concluída', 2);
    for (const product of products) await expectProductStock(page, product, 4);
    await openModule(page, '/controle', 'Controle Diário');

    let stockRestocks = 0;
    page.on('response', response => {
      if (
        response.url().includes('/rest/v1/rpc/adjust_product_stock') &&
        response.request().method() === 'POST' &&
        response.request().postDataJSON().p_delta === 1 &&
        response.ok()
      ) stockRestocks += 1;
    });
    const appointmentDelete = waitForMutation(page, 'appointments', 'DELETE');
    await page.getByRole('button', { name: `Excluir atendimento de ${client}`, exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', {
      name: 'Excluir atendimento',
      exact: true,
    }).click();
    await appointmentDelete;
    await expect.poll(() => stockRestocks).toBe(products.length);

    await expect(page.getByRole('row').filter({ hasText: client })).toHaveCount(0);
    for (const product of products) await expectProductStock(page, product, 5);
  });

  test('bloqueia a exclusão de atendimento após 24 horas', async ({ page }) => {
    const { client } = await createAttendanceWithProduct(page, 'fora da janela');
    const expiredAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    let deleteRequests = 0;

    page.on('request', request => {
      if (request.url().includes('/rest/v1/appointments') && request.method() === 'DELETE') {
        deleteRequests += 1;
      }
    });

    await page.route('**/rest/v1/appointments**', async route => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }

      const response = await route.fetch();
      const rows = await response.json() as Array<Record<string, unknown>>;
      await route.fulfill({
        response,
        json: rows.map(row => row.client === client
          ? { ...row, attendance_recorded_at: expiredAt }
          : row),
      });
    });

    await page.reload();
    const deleteButton = page.getByRole('button', {
      name: `Excluir atendimento de ${client} (prazo de 24 horas encerrado)`,
      exact: true,
    });
    await expect(deleteButton).toBeDisabled();
    await expect(page.getByRole('row').filter({ hasText: client })).toBeVisible();
    expect(deleteRequests).toBe(0);
  });

  test('registra o atendimento mesmo quando o cadastro automático do cliente falha', async ({ page }) => {
    const client = uniqueName('Cliente sem cadastro automático');
    const phone = `119${Date.now().toString().slice(-8)}`;
    await openModule(page, '/controle', 'Controle Diário');

    const form = page.locator('form').filter({
      has: page.getByRole('button', { name: /^Salvar Atendimento/ }),
    });
    await form.getByTestId('input-attendance-client-name').fill(client);
    await form.getByLabel('Telefone do Cliente').fill(phone);
    await form.locator('select').nth(1).selectOption({ index: 1 });
    await form.getByTestId('input-attendance-service-value').fill('50');

    await page.route('**/rest/v1/rpc/create_or_get_client_by_phone', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'falha simulada ao salvar cliente' }),
      }),
    );
    const appointmentCreate = waitForMutation(page, 'appointments', 'POST');
    await form.getByRole('button', { name: /^Salvar Atendimento/ }).click();
    await appointmentCreate;

    await expect(page.getByRole('row').filter({ hasText: client })).toBeVisible();
    await expect(page.getByText(
      'Atendimento registrado, mas o cliente não foi salvo. Cadastre-o depois pelo módulo Clientes.',
      { exact: true },
    )).toBeVisible();
  });

  test('falha ao excluir mantém o lançamento e não altera o estoque', async ({ page }) => {
    const { client, product } = await createAttendanceWithProduct(page, 'exclusão rejeitada');
    await expectProductStock(page, product, 4);
    await openModule(page, '/controle', 'Controle Diário');

    let stockRestocks = 0;
    page.on('request', request => {
      if (
        request.url().includes('/rest/v1/rpc/adjust_product_stock') &&
        request.method() === 'POST' &&
        request.postDataJSON().p_delta > 0
      ) stockRestocks += 1;
    });
    await page.route('**/rest/v1/appointments*', async route => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'falha simulada ao excluir atendimento' }),
        });
        return;
      }
      await route.continue();
    });

    await page.getByRole('button', { name: `Excluir atendimento de ${client}`, exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', {
      name: 'Excluir atendimento',
      exact: true,
    }).click();

    await expect(page.getByText('Erro ao remover agendamento', { exact: true }).last()).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: client })).toBeVisible();
    expect(stockRestocks).toBe(0);
    await page.unroute('**/rest/v1/appointments*');
    await expectProductStock(page, product, 4);
  });

  test('falha ao remover evento do Google Agenda não oculta a exclusão local', async ({ page }) => {
    const { client, product } = await createAttendanceWithProduct(page, 'Google Agenda indisponível');
    await expectProductStock(page, product, 4);
    await openModule(page, '/controle', 'Controle Diário');

    let externalDeleteRequested = false;
    await page.route('**/api/google-calendar/appointments/**', async route => {
      if (route.request().method() === 'DELETE') {
        externalDeleteRequested = true;
        await route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'falha simulada no Google Agenda' }),
        });
        return;
      }
      await route.continue();
    });

    const appointmentDelete = waitForMutation(page, 'appointments', 'DELETE');
    await page.getByRole('button', { name: `Excluir atendimento de ${client}`, exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', {
      name: 'Excluir atendimento',
      exact: true,
    }).click();
    await appointmentDelete;

    await expect(page.getByText(client, { exact: true })).toHaveCount(0);
    await expect(page.getByText(
      'Atendimento excluído, mas pode continuar no Google Agenda.',
      { exact: true },
    )).toBeVisible();
    expect(externalDeleteRequested).toBe(true);
    await expectProductStock(page, product, 5);
  });

  test('salva e recarrega configurações do estabelecimento', async ({ page }) => {
    const name = uniqueName('Barbearia E2E');
    await openModule(page, '/configuracoes', 'Configurações');
    await page.getByPlaceholder('Ex: Barber Manager').fill(name);
    const settingsResponse = page.waitForResponse(response =>
      response.url().includes('/organization_settings') &&
      response.request().method() === 'POST' &&
      response.ok(),
    );
    await page.getByRole('button', { name: 'Salvar Alterações', exact: true }).click();
    await settingsResponse;
    await expect(page.getByText('Configurações salvas com sucesso.', { exact: true })).toBeVisible();
    await settleMutation(page);
    await page.reload();
    await expect(page.getByPlaceholder('Ex: Barber Manager')).toHaveValue(name);
  });
});
