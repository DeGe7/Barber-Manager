import { expect, test } from '../fixtures';

test('visualizar cargos não altera dados, identidade nem a sessão real', async ({ page }) => {
  const writes: string[] = [];
  const user = {
    id: '00000000-0000-4000-8000-000000000175',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'dev-admin@example.test',
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: 'Gestor E2E' },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
  const roles = [
    { id: 'role-gestor', key: 'gestor', label: 'Gestor / Proprietário', description: '', isActive: true, permissions: [] },
    { id: 'role-dev-admin', key: 'dev-admin', label: 'DEV/ADMIN', description: '', isActive: true, permissions: [] },
    { id: 'role-barbeiro', key: 'barbeiro', label: 'Barbeiro', description: '', isActive: true, permissions: ['dashboard', 'agenda', 'controle'] },
    { id: 'role-manicure', key: 'manicure', label: 'Manicure', description: '', isActive: true, permissions: ['dashboard', 'agenda', 'controle'] },
    { id: 'role-vendedor', key: 'vendedor', label: 'Vendedor de Prótese', description: '', isActive: true, permissions: ['dashboard', 'agenda', 'clientes', 'controle'] },
  ];

  await page.route('**/auth/v1/token?grant_type=password', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      access_token: 'role-preview-test-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'role-preview-test-refresh-token',
      user,
    }),
  }));
  await page.route('**/auth/v1/logout*', route => route.fulfill({ status: 204, body: '' }));
  await page.route('**/auth/v1/user*', async route => {
    if (route.request().method() !== 'GET') writes.push(`AUTH ${route.request().method()}`);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
  });
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const path = request.url().split('/rest/v1/')[1]?.split(/[?#]/, 1)[0] ?? '';
    const table = path.split('/').pop();
    let body: unknown = [];

    if (request.method() !== 'GET') {
      if (path === 'rpc/current_organization_id') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify('organization-role-preview-test'),
        });
        return;
      }
      if (path === 'rpc/get_my_financial_earnings') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            entry_id: 'earning-preview',
            entry_date: '2026-10-20',
            kind: 'commission',
            source: 'Comissão por execução · Barbearia',
            attribution: 'Atendimento',
            amount: 25,
          }]),
        });
        return;
      }
      writes.push(`${request.method()} /rest/v1/${path}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    if (table === 'profiles') {
      body = {
        id: user.id,
        email: user.email,
        full_name: 'Gestor E2E',
        avatar_url: null,
        default_organization_id: 'organization-role-preview-test',
      };
    } else if (table === 'organization_members') {
      body = {
        organization_id: 'organization-role-preview-test',
        role: 'dev-admin',
        professional_id: null,
      };
    } else if (table === 'organization_settings') {
      body = { payload: { name: 'Barber Manager', roles } };
    } else if (table === 'professionals') {
      body = [{
        id: 'professional-preview-barber',
        name: 'Barbeiro E2E',
        role: 'barbeiro',
        initials: 'BE',
        color: '#3b82f6',
        is_active: true,
        commissions: { barbearia: 0.5, manutencao: 0, manicure: 0, protese: 0, mentoria: 0 },
      }];
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto('/login');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill('e2e-role-preview');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  const roleSelector = page.getByRole('combobox', { name: 'Visualizar como cargo' });
  await expect(roleSelector).toBeVisible();
  const signedInIdentity = page.locator('header a[aria-label="Abrir meu perfil"] span');
  await expect(signedInIdentity).toHaveText('Gestor E2E');

  await roleSelector.selectOption('barbeiro');
  await expect(page.getByText(/Visualizando como Barbeiro/)).toBeVisible();
  await expect(signedInIdentity).toHaveText('Gestor E2E');
  await expect(page.getByRole('link', { name: 'Financeiro' })).toBeVisible();
  await page.evaluate("window.history.pushState(null, '', '/financeiro'); window.dispatchEvent(new PopStateEvent('popstate'))");
  await expect(page.getByRole('heading', { name: 'Ganhos de Barbeiro' })).toBeVisible();
  await expect(page.getByText('Comissão por execução · Barbearia')).toBeVisible();
  await expect(page.getByText('Entradas', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Despesas', { exact: true })).toHaveCount(0);
  await page.evaluate("window.history.pushState(null, '', '/configuracoes/acesso'); window.dispatchEvent(new PopStateEvent('popstate'))");
  await expect(page.getByRole('heading', { name: 'Acesso Restrito' })).toBeVisible();

  await roleSelector.selectOption('gestor');
  await page.evaluate("window.history.pushState(null, '', '/configuracoes/acesso'); window.dispatchEvent(new PopStateEvent('popstate'))");
  await expect(page.getByRole('heading', { name: 'Papéis e Acesso' })).toBeVisible();
  const readOnlyContent = page.locator('main [inert]');
  await expect(readOnlyContent).toBeVisible();
  const savePermissions = page.getByRole('button', { name: 'Salvar permissões', exact: true });
  await expect(savePermissions).toBeVisible();

  await savePermissions.evaluate(button => {
    button.dispatchEvent(new button.ownerDocument.defaultView!.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    }));
  });
  await page.waitForTimeout(250);
  expect(writes).toEqual([]);

  await page.evaluate("window.history.pushState(null, '', '/perfil'); window.dispatchEvent(new PopStateEvent('popstate'))");
  const editName = page.getByRole('button', { name: 'Editar nome' });
  await editName.evaluate(button => {
    button.dispatchEvent(new button.ownerDocument.defaultView!.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    }));
  });
  const nameInput = page.getByRole('textbox', { name: 'Nome e sobrenome' });
  await expect(nameInput).toBeVisible();
  await nameInput.evaluate(input => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
    setter?.call(input, 'Nome alterado no teste');
    input.dispatchEvent(new input.ownerDocument.defaultView!.Event('input', { bubbles: true }));
  });
  await expect(nameInput).toHaveValue('Nome alterado no teste');
  await page.getByRole('button', { name: 'Salvar nome' }).evaluate(button => {
    button.dispatchEvent(new button.ownerDocument.defaultView!.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    }));
  });
  await expect(page.getByText('Não é possível realizar alterações durante a visualização por cargo.')).toBeVisible();
  expect(writes).toEqual([]);

  await roleSelector.selectOption('');
  await expect(page.getByText(/Visualizando como/)).toHaveCount(0);
  await expect(signedInIdentity).toHaveText('Gestor E2E');
  await expect(page.getByRole('complementary').getByText('DEV/ADMIN', { exact: true })).toBeVisible();
  await page.evaluate("window.history.pushState(null, '', '/configuracoes/acesso'); window.dispatchEvent(new PopStateEvent('popstate'))");
  await expect(page.getByRole('heading', { name: 'Papéis e Acesso' })).toBeVisible();

  await roleSelector.selectOption('barbeiro');
  await page.getByRole('button', { name: 'Sair do sistema' }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill('e2e-role-preview');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(roleSelector).toHaveValue('');
  await expect(signedInIdentity).toHaveText('Gestor E2E');
});
