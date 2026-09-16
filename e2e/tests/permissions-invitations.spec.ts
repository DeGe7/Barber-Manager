import {
  accounts,
  expect,
  invitationTokens,
  loginAs,
  openModule,
  requireAccount,
  test,
} from '../fixtures';

test.describe('visibilidade e restrições por papel', () => {
  test('não expõe clientes de outra organização', async ({ page }) => {
    test.skip(!accounts.manager || !accounts.onboarding, 'Requires manager and onboarding E2E accounts.');
    const onboarding = requireAccount(accounts.onboarding, 'onboarding');
    const manager = requireAccount(accounts.manager, 'manager');
    const privateClient = `Cliente organização isolada ${Date.now().toString(36)}`;

    await loginAs(page, onboarding);
    await page.goto('/');
    const onboardingHeading = page.getByRole('heading', { name: 'Configure seu estabelecimento', exact: true });
    await Promise.race([
      onboardingHeading.waitFor({ state: 'visible', timeout: 10_000 }),
      page.locator('main h2').first().waitFor({ state: 'visible', timeout: 10_000 }),
    ]);
    const needsOnboarding = await onboardingHeading.isVisible().catch(() => false);
    if (needsOnboarding) {
      await page.getByLabel('Nome do estabelecimento').fill(`Organização isolada ${Date.now().toString(36)}`);
      await page.getByRole('button', { name: 'Continuar', exact: true }).click();
      await expect(page).not.toHaveURL(/\/onboarding/, { timeout: 20_000 });
      await page.reload();
    }
    await openModule(page, '/clientes', 'Clientes');
    await page.getByRole('button', { name: 'Novo Cliente', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input').nth(0).fill(privateClient);
    await dialog.locator('input').nth(1).fill('11977776666');
    await dialog.locator('input').nth(3).fill(`isolated-${Date.now().toString(36)}@example.com`);
    await dialog.getByRole('button', { name: 'Salvar Cliente', exact: true }).click();
    await expect(page.locator('tbody tr').filter({ hasText: privateClient })).toBeVisible();

    await page.getByRole('button', { name: 'Sair do sistema', exact: true }).click();
    await loginAs(page, manager);
    await openModule(page, '/clientes', 'Clientes');
    await expect(page.getByText(privateClient, { exact: true })).toHaveCount(0);
  });

  test('gestor vê todos os módulos e pode abrir configurações', async ({ page }) => {
    test.skip(!accounts.manager, 'Requires E2E_MANAGER_EMAIL and E2E_MANAGER_PASSWORD.');
    await loginAs(page, requireAccount(accounts.manager, 'manager'));
    for (const label of [
      'Controle Diário',
      'Agenda',
      'Clientes',
      'Profissionais',
      'Vendas & Mentoria',
      'Produtos & Estoque',
      'Planos & Mensalidades',
      'Financeiro',
      'Configurações',
    ]) {
      await expect(page.getByRole('complementary').getByRole('link', { name: label, exact: true })).toBeVisible();
    }
    await openModule(page, '/configuracoes/acesso', 'Configurações');
    await expect(page.getByRole('button', { name: 'Salvar permissões', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Papéis e Acesso', exact: true })).toBeVisible();
  });

  test('gestor vê valores e percentuais corretos em cada período', async ({ page }) => {
    test.skip(
      !accounts.manager || process.env.E2E_PROVISION !== 'true',
      'Requires the provisioned manager account and revenue fixtures.',
    );
    await loginAs(page, requireAccount(accounts.manager, 'manager'));
    await openModule(page, '/dashboard', 'Visão geral');

    const card = page.getByTestId('professional-revenue-card');
    await expect(card).toBeVisible();

    const expectedByPeriod = {
      Diária: [
        ['Profissional operacional E2E', '110,00', '68,75%'],
        ['Profissional customizado E2E', '50,00', '31,25%'],
      ],
      Semanal: [
        ['Profissional operacional E2E', '310,00', '86,11%'],
        ['Profissional customizado E2E', '50,00', '13,89%'],
      ],
      Mensal: [
        ['Profissional customizado E2E', '350,00', '53,03%'],
        ['Profissional operacional E2E', '310,00', '46,97%'],
      ],
    } as const;

    for (const [label, expectedRows] of Object.entries(expectedByPeriod)) {
      const button = page.getByRole('button', { name: label, exact: true });
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');

      for (const [professional, value, percentage] of expectedRows) {
        const row = card.getByTestId('revenue-professional-row').filter({ hasText: professional });
        await expect(row).toContainText(new RegExp(`R\\$\\s*${value}`));
        await expect(row).toContainText(percentage);
      }
    }
  });

  test('gestor vê o estado vazio quando não há faturamento no período', async ({ page }) => {
    test.skip(!accounts.manager, 'Requires E2E_MANAGER_EMAIL and E2E_MANAGER_PASSWORD.');
    await page.route('**/rest/v1/appointments**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
    });

    await loginAs(page, requireAccount(accounts.manager, 'manager'));
    await openModule(page, '/dashboard', 'Visão geral');

    const card = page.getByTestId('professional-revenue-card');
    await expect(card.getByText('Nenhum faturamento registrado no período selecionado')).toBeVisible();
    await expect(card.getByTestId('revenue-professional-row')).toHaveCount(0);
  });

  test('profissional operacional vê apenas a operação autorizada e recebe acesso restrito', async ({ page }) => {
    test.skip(!accounts.operational, 'Requires E2E_OPERATIONAL_EMAIL and E2E_OPERATIONAL_PASSWORD.');
    await loginAs(page, requireAccount(accounts.operational, 'operational'));
    for (const label of ['Controle Diário', 'Agenda']) {
      await expect(page.getByRole('complementary').getByRole('link', { name: label, exact: true })).toBeVisible();
    }
    for (const label of ['Profissionais', 'Produtos & Estoque', 'Financeiro', 'Configurações']) {
      await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(0);
    }
    await page.goto('/produtos');
    await expect(page.getByRole('heading', { name: 'Acesso Restrito', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adicionar Produto', exact: true })).toHaveCount(0);
  });

  test('papel customizado respeita o módulo permitido e bloqueia o módulo removido', async ({ page }) => {
    test.skip(!accounts.customRole, 'Requires E2E_CUSTOM_ROLE_EMAIL and E2E_CUSTOM_ROLE_PASSWORD.');
    const allowedPath = process.env.E2E_CUSTOM_ALLOWED_PATH || '/agenda';
    const allowedHeading = process.env.E2E_CUSTOM_ALLOWED_HEADING || 'Agenda';
    const deniedPath = process.env.E2E_CUSTOM_DENIED_PATH || '/produtos';
    await loginAs(page, requireAccount(accounts.customRole, 'custom_role'));
    await openModule(page, allowedPath, allowedHeading);
    await page.goto(deniedPath);
    await expect(page.getByRole('heading', { name: 'Acesso Restrito', exact: true })).toBeVisible();
  });
});

test.describe('convites da equipe', () => {
  test('exibe uma página pública de convite e preserva o token nos links', async ({ page }) => {
    const token = invitationTokens.pending;
    test.skip(!token, 'Requires E2E_INVITATION_TOKEN from a pending invitation.');
    await page.goto(`/convite/${encodeURIComponent(token!)}`);
    await expect(page.getByRole('heading', { name: 'Convite para a equipe', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Já tenho uma conta', exact: true })).toHaveAttribute('href', /convite=/);
    await expect(page.getByRole('link', { name: 'Criar minha conta', exact: true })).toHaveAttribute('href', /convite=/);
  });

  async function submitInvitationLogin(page: Parameters<typeof loginAs>[0], accountName: 'expired' | 'revoked' | 'invited' | 'manager', token: string) {
    const account = requireAccount(accounts[accountName], accountName);
    await page.goto(`/login?convite=${encodeURIComponent(token)}`);
    await page.getByLabel('E-mail').fill(account.email);
    await page.getByLabel('Senha').fill(account.password);
    const invitationResponse = page.waitForResponse(response =>
      response.url().includes('/rpc/accept_organization_invitation') &&
      response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    const response = await invitationResponse;
    expect(response.ok()).toBe(false);
  }

  test('recusa convite expirado', async ({ page }) => {
    const token = invitationTokens.expired;
    test.skip(!token || !accounts.expired, 'Requires the provisioned expired-invitation account.');
    await submitInvitationLogin(page, 'expired', token!);
    await expect(page.locator('[role="alert"]').filter({ hasText: 'Este convite expirou' })).toBeVisible();
  });

  test('recusa convite revogado', async ({ page }) => {
    const token = invitationTokens.revoked;
    test.skip(!token || !accounts.revoked, 'Requires the provisioned revoked-invitation account.');
    await submitInvitationLogin(page, 'revoked', token!);
    await expect(page.locator('[role="alert"]').filter({ hasText: 'convite foi revogado' })).toBeVisible();
  });

  test('recusa convite que já foi usado', async ({ page }) => {
    const token = invitationTokens.used;
    test.skip(!token || !accounts.expired, 'Requires the provisioned used-invitation account.');
    await submitInvitationLogin(page, 'expired', token!);
    await expect(page.locator('[role="alert"]').filter({ hasText: 'convite já foi utilizado' })).toBeVisible();
  });

  test('recusa o uso por uma conta com e-mail diferente', async ({ page }) => {
    const token = invitationTokens.emailCheck;
    test.skip(!token || !accounts.manager, 'Requires E2E_EMAIL_CHECK_INVITATION_TOKEN and a manager account.');
    await submitInvitationLogin(page, 'manager', token!);
    await expect(page.locator('[role="alert"]').filter({ hasText: 'e-mail que recebeu este convite' })).toBeVisible();
  });
});