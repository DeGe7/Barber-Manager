import { accounts, expect, invitationTokens, loginAs, requireAccount, test } from '../fixtures';

test.describe('autenticação e onboarding', () => {
  test('redireciona uma rota protegida para o login quando não há sessão', async ({ page }) => {
    await page.goto('/clientes');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
  });

  test('valida confirmação de senha no cadastro antes de chamar o Supabase', async ({ page }) => {
    await page.goto('/cadastro');
    await page.getByLabel('Nome e sobrenome').fill('Usuário E2E');
    await page.getByLabel('E-mail').fill(`e2e-${Date.now().toString(36)}@example.com`);
    await page.locator('#signup-password').fill('senha-e2e-123');
    await page.getByLabel('Confirmar senha').fill('senha-diferente');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(page.getByText('As senhas não coincidem.', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/cadastro/);
  });

  test('shows the login form and rejects invalid credentials', async ({ page }) => {
    test.skip(!accounts.manager, 'Requires E2E_MANAGER_EMAIL and E2E_MANAGER_PASSWORD.');
    const account = requireAccount(accounts.manager, 'manager');
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Barber Manager' })).toBeVisible();
    await page.getByLabel('E-mail').fill(account.email);
    await page.getByLabel('Senha').fill(`${account.password}-invalid`);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(
      page.locator('[role="alert"]').filter({ hasText: 'E-mail ou senha inválidos.' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('keeps a valid session after reload and logs out', async ({ page }) => {
    test.skip(!accounts.manager, 'Requires E2E_MANAGER_EMAIL and E2E_MANAGER_PASSWORD.');
    const account = requireAccount(accounts.manager, 'manager');
    await loginAs(page, account);
    await expect(page.getByRole('link', { name: 'Abrir meu perfil' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('link', { name: 'Abrir meu perfil' })).toBeVisible();

    await page.getByRole('button', { name: 'Sair do sistema', exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
  });

  test('redirects a session without an organization to onboarding and completes it', async ({ page }) => {
    test.skip(!accounts.onboarding, 'Requires a dedicated Supabase user without an organization.');
    const account = requireAccount(accounts.onboarding, 'onboarding');
    await loginAs(page, account);
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole('heading', { name: 'Configure seu estabelecimento' })).toBeVisible();

    await page.getByLabel('Nome do estabelecimento').fill(`E2E ${Date.now().toString(36)}`);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page).not.toHaveURL(/\/onboarding/);
    await page.reload();
    await expect(page).not.toHaveURL(/\/onboarding/);
  });

  test('preserves an invitation token when navigating to sign in or sign up', async ({ page }) => {
    const token = invitationTokens.pending;
    test.skip(!token, 'Requires E2E_INVITATION_TOKEN from a pending invitation.');
    await page.goto(`/login?convite=${encodeURIComponent(token!)}`);
    await expect(page.getByText('Convite encontrado.', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cadastre-se' })).toHaveAttribute('href', /convite=/);
  });
});