import { expect, test as base, type Page } from '@playwright/test';
import { isProvisioningEnabled, readFixtureManifest } from './provision';

export interface Credentials {
  email: string;
  password: string;
}

function credentials(prefix: string): Credentials | undefined {
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  return email && password ? { email, password } : undefined;
}

function generated() {
  return isProvisioningEnabled() ? readFixtureManifest() : undefined;
}

export const accounts = {
  get manager() {
    return generated()?.accounts.manager || credentials('E2E_MANAGER');
  },
  get operational() {
    return generated()?.accounts.operational || credentials('E2E_OPERATIONAL');
  },
  get customRole() {
    return generated()?.accounts.customRole || credentials('E2E_CUSTOM_ROLE');
  },
  get invited() {
    return generated()?.accounts.invited || credentials('E2E_INVITED');
  },
  get onboarding() {
    return generated()?.accounts.onboarding || credentials('E2E_ONBOARDING');
  },
  get expired() {
    return generated()?.accounts.expired || credentials('E2E_EXPIRED');
  },
  get revoked() {
    return generated()?.accounts.revoked || credentials('E2E_REVOKED');
  },
};

export const invitationTokens = {
  get pending() {
    return generated()?.invitationTokens.pending || process.env.E2E_INVITATION_TOKEN;
  },
  get expired() {
    return generated()?.invitationTokens.expired || process.env.E2E_EXPIRED_INVITATION_TOKEN;
  },
  get revoked() {
    return generated()?.invitationTokens.revoked || process.env.E2E_REVOKED_INVITATION_TOKEN;
  },
  get used() {
    return generated()?.invitationTokens.used || process.env.E2E_USED_INVITATION_TOKEN;
  },
  get emailCheck() {
    return generated()?.invitationTokens.emailCheck || process.env.E2E_EMAIL_CHECK_INVITATION_TOKEN;
  },
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
  await expect(page.locator('main h2').filter({ hasText: heading }).first()).toBeVisible();
  await expect(page.locator('main .animate-pulse')).toHaveCount(0, { timeout: 20_000 });
}

export async function settleMutation(page: Page) {
  // Mutations are intentionally optimistic in the store. This gives the Supabase
  // request time to commit before a reload asserts persistence.
  await page.waitForTimeout(500);
}

export function waitForMutation(page: Page, table: string, method: string) {
  return page.waitForResponse(
    response =>
      response.url().includes(`/rest/v1/${table}`) &&
      response.request().method() === method &&
      response.ok(),
  );
}

export function uniqueName(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}`;
}

export function today() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}