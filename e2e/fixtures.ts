import { expect, test as base, type Page } from '@playwright/test';

export interface Credentials {
  email: string;
  password: string;
}

function credentials(prefix: string): Credentials | undefined {
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  return email && password ? { email, password } : undefined;
}

export const accounts = {
  manager: credentials('E2E_MANAGER'),
  operational: credentials('E2E_OPERATIONAL'),
  customRole: credentials('E2E_CUSTOM_ROLE'),
  invited: credentials('E2E_INVITED'),
  onboarding: credentials('E2E_ONBOARDING'),
};

export const test = base;
export { expect };

export function requireAccount(account: Credentials | undefined, name: string): Credentials {
  if (!account) {
    throw new Error(`Configure E2E_${name.toUpperCase()}_EMAIL and E2E_${name.toUpperCase()}_PASSWORD.`);
  }
  return account;
}

export async function loginAs(page: Page, account: Credentials, options: { invitationToken?: string } = {}) {
  const query = options.invitationToken ? `?convite=${encodeURIComponent(options.invitationToken)}` : '';
  await page.goto(`/login${query}`);
  await page.getByLabel('E-mail').fill(account.email);
  await page.getByLabel('Senha').fill(account.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 20_000 });
}

export async function openModule(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
}

export async function settleMutation(page: Page) {
  // Mutations are intentionally optimistic in the store. This gives the Supabase
  // request time to commit before a reload asserts persistence.
  await page.waitForTimeout(500);
}

export function uniqueName(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}`;
}

export function today() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}