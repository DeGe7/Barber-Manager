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
    await expect(page.getByText(/Este convite expirou/i)).toBeVisible();
  });

  test('recusa convite revogado', async ({ page }) => {
    const token = invitationTokens.revoked;
    test.skip(!token || !accounts.revoked, 'Requires the provisioned revoked-invitation account.');
    await submitInvitationLogin(page, 'revoked', token!);
    await expect(page.getByText(/convite foi revogado/i)).toBeVisible();
  });

  test('recusa convite que já foi usado', async ({ page }) => {
    const token = invitationTokens.used;
    test.skip(!token || !accounts.expired, 'Requires the provisioned used-invitation account.');
    await submitInvitationLogin(page, 'expired', token!);
    await expect(page.getByText(/convite já foi utilizado/i)).toBeVisible();
  });

  test('recusa o uso por uma conta com e-mail diferente', async ({ page }) => {
    const token = invitationTokens.emailCheck;
    test.skip(!token || !accounts.manager, 'Requires E2E_EMAIL_CHECK_INVITATION_TOKEN and a manager account.');
    await submitInvitationLogin(page, 'manager', token!);
    await expect(page.getByText(/e-mail que recebeu este convite/i)).toBeVisible();
  });
});