import { accounts, expect, loginAs, requireAccount, test, uniqueName } from '../fixtures';

test('novo cargo persiste após F5 e todos os cargos aparecem em Papéis e Acesso', async ({ page }) => {
  test.setTimeout(90_000);
  const name = uniqueName('Cargo persistente');
  await loginAs(page, requireAccount(accounts.manager, 'manager'));
  try {
    await page.goto('/configuracoes/cargos-pagamentos');
    await page.getByPlaceholder('Novo cargo').fill(name);
    await page.getByRole('button', { name: 'Adicionar cargo', exact: true }).click();
    await expect(page.getByText('Cargo criado e salvo. Permissões disponíveis em Papéis e Acesso.', { exact: true })).toBeVisible();
    await page.reload();
    const roleInput = page.getByRole('textbox', { name: /^Nome do cargo / });
    await expect.poll(() => roleInput.evaluateAll(inputs => inputs.map(input => (input as { value: string }).value))).toContain(name);
    const labels = await roleInput.evaluateAll(inputs => inputs.map(input => (input as { value: string }).value));
    expect(labels).toContain(name);

    await page.goto('/configuracoes/acesso');
    for (const label of labels) {
      await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
    }
    const role = page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await role.getByRole('checkbox', { name: /^Clientes/ }).check();
    await role.getByRole('button', { name: 'Cargo ativo', exact: true }).click();
    await page.getByRole('button', { name: 'Salvar permissões', exact: true }).click();
    await expect(page.getByText('Cargos e permissões salvos.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(role.getByRole('checkbox', { name: /^Clientes/ })).toBeChecked();
    await expect(role.getByRole('button', { name: 'Cargo inativo', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  } finally {
    await page.goto('/configuracoes/cargos-pagamentos');
    const remove = page.getByRole('button', { name: `Excluir cargo ${name}`, exact: true });
    if (await remove.count()) {
      page.once('dialog', dialog => dialog.accept());
      await remove.click();
      await expect(page.getByText('Cargo excluído.', { exact: true })).toBeVisible();
      await page.reload();
      await expect(remove).toHaveCount(0);
    }
  }
});

test('falha ao gravar cargo não anuncia sucesso nem cria cargo local', async ({ page }) => {
  const name = uniqueName('Cargo rejeitado');
  await loginAs(page, requireAccount(accounts.manager, 'manager'));
  await page.goto('/configuracoes/cargos-pagamentos');
  await page.route('**/rest/v1/organization_settings*', async route => {
    if (route.request().method() === 'POST' && route.request().postData()?.includes(name)) {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: '42501', message: 'Falha simulada de gravação' }),
      });
    } else {
      await route.continue();
    }
  });
  await page.getByPlaceholder('Novo cargo').fill(name);
  await page.getByRole('button', { name: 'Adicionar cargo', exact: true }).click();
  await expect(page.getByText('Erro ao salvar configuração', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Novo cargo')).toHaveValue(name);
  await expect(page.getByRole('button', { name: `Excluir cargo ${name}`, exact: true })).toHaveCount(0);
  await page.unroute('**/rest/v1/organization_settings*');
  await page.reload();
  await expect(page.getByRole('button', { name: `Excluir cargo ${name}`, exact: true })).toHaveCount(0);
});
