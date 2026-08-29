import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface Credentials {
  email: string;
  password: string;
}

export interface E2EFixtureManifest {
  organizationId: string;
  accounts: {
    manager: Credentials;
    operational: Credentials;
    customRole: Credentials;
    invited: Credentials;
    onboarding: Credentials;
    expired: Credentials;
    revoked: Credentials;
  };
  invitationTokens: {
    pending: string;
    expired: string;
    revoked: string;
    used: string;
    emailCheck: string;
  };
  userIds: string[];
}

interface ProvisionConfig {
  url: string;
  serviceRoleKey: string;
  fixtureFile: string;
}

interface AuthUser {
  id: string;
}

const fixtureFile = resolve(
  process.env.E2E_FIXTURE_FILE || 'test-results/e2e-fixtures.json',
);

export function isProvisioningEnabled() {
  return process.env.E2E_PROVISION === 'true';
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when E2E_PROVISION=true.`);
  return value;
}

function getConfig(): ProvisionConfig {
  const url = requiredEnv('E2E_SUPABASE_TEST_URL').replace(/\/+$/, '');
  const serviceRoleKey = requiredEnv('E2E_SUPABASE_TEST_SERVICE_ROLE_KEY');

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    throw new Error(
      'E2E_SUPABASE_TEST_URL must be the HTTPS URL of a Supabase test project.',
    );
  }

  const configuredProductionUrls = [
    process.env.E2E_SUPABASE_PRODUCTION_URL,
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_URL,
  ]
    .map(value => value?.trim().replace(/\/+$/, ''))
    .filter((value): value is string => Boolean(value));

  if (configuredProductionUrls.includes(url)) {
    throw new Error(
      'E2E_SUPABASE_TEST_URL matches a configured production Supabase URL; refusing to provision.',
    );
  }

  return { url, serviceRoleKey, fixtureFile };
}

function headers(
  config: ProvisionConfig,
  extra: Record<string, string> = {},
  authorizationToken = config.serviceRoleKey,
) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${authorizationToken}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function responseMessage(body: unknown): string {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    return String(record.message || record.error_description || record.error || JSON.stringify(body));
  }
  return 'request failed without a response body';
}

async function request(
  config: ProvisionConfig,
  path: string,
  init: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    authorizationToken?: string;
  } = {},
): Promise<unknown> {
  const response = await fetch(`${config.url}${path}`, {
    method: init.method || 'GET',
    headers: headers(config, init.headers, init.authorizationToken),
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = await parseResponse(response);
  if (!response.ok) {
    throw new Error(`Supabase ${init.method || 'GET'} ${path} failed (${response.status}): ${responseMessage(body)}`);
  }
  return body;
}

async function postgrest(
  config: ProvisionConfig,
  table: string,
  body: unknown,
  options: {
    method?: string;
    query?: string;
    prefer?: string;
    authorizationToken?: string;
  } = {},
): Promise<Record<string, unknown>[]> {
  const response = await request(
    config,
    `/rest/v1/${table}${options.query || ''}`,
    {
      method: options.method || 'POST',
      body,
      headers: {
        Prefer: options.prefer || 'return=representation',
      },
      authorizationToken: options.authorizationToken,
    },
  );
  return Array.isArray(response) ? response as Record<string, unknown>[] : [];
}

async function createUser(
  config: ProvisionConfig,
  email: string,
  fullName: string,
  password: string,
): Promise<AuthUser> {
  const body = await request(config, '/auth/v1/admin/users', {
    method: 'POST',
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    },
  });
  if (!body || typeof body !== 'object' || typeof (body as AuthUser).id !== 'string') {
    throw new Error('Supabase did not return an id for the provisioned user.');
  }
  return body as AuthUser;
}

async function signInUser(
  config: ProvisionConfig,
  credentials: Credentials,
): Promise<string> {
  const body = await request(config, '/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: {
      email: credentials.email,
      password: credentials.password,
    },
  });
  if (!body || typeof body !== 'object' || typeof (body as { access_token?: unknown }).access_token !== 'string') {
    throw new Error('Supabase did not return an access token for the manager fixture.');
  }
  return String((body as { access_token: string }).access_token);
}

function password() {
  return `E2E-${randomBytes(24).toString('base64url')}`;
}

function token() {
  return randomBytes(32).toString('hex');
}

function tokenHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function runId() {
  return `${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`;
}

function email(role: string, id: string) {
  const domain = process.env.E2E_TEST_EMAIL_DOMAIN?.trim() || 'example.com';
  return `e2e-${role}-${id}@${domain}`;
}

async function createInvitation(
  config: ProvisionConfig,
  input: {
    organizationId: string;
    professionalId: string;
    email: string;
    invitedBy: string;
    token: string;
    expiresAt: string;
    acceptedAt?: string;
    acceptedBy?: string;
    revokedAt?: string;
  },
) {
  const rows = await postgrest(config, 'organization_invitations', {
    organization_id: input.organizationId,
    email: input.email,
    professional_id: input.professionalId,
    role: 'barbeiro',
    token_hash: tokenHash(input.token),
    expires_at: input.expiresAt,
    accepted_at: input.acceptedAt,
    accepted_by: input.acceptedBy,
    revoked_at: input.revokedAt,
    invited_by: input.invitedBy,
  });
  if (!rows[0]?.id) throw new Error('Supabase did not return the invitation id.');
}

export async function provisionFixtures(): Promise<void> {
  if (!isProvisioningEnabled()) return;
  const config = getConfig();
  const id = runId();
  const userIds: string[] = [];
  let organizationId: string | undefined;

  try {
    const accountSpecs = [
      ['manager', 'Gestor E2E'],
      ['operational', 'Profissional operacional E2E'],
      ['customRole', 'Profissional papel customizado E2E'],
      ['invited', 'Convidado E2E'],
      ['onboarding', 'Onboarding E2E'],
      ['expired', 'Conta convite expirado E2E'],
      ['revoked', 'Conta convite revogado E2E'],
    ] as const;
    const accountEntries: Array<
      readonly [
        (typeof accountSpecs)[number][0],
        { credentials: Credentials; userId: string },
      ]
    > = [];
    for (const [role, fullName] of accountSpecs) {
      const credentials = {
        email: email(role, id),
        password: password(),
      };
      const user = await createUser(config, credentials.email, fullName, credentials.password);
      userIds.push(user.id);
      accountEntries.push([role, { credentials, userId: user.id }]);
    }
    const createdAccounts = Object.fromEntries(accountEntries) as Record<
      (typeof accountSpecs)[number][0],
      { credentials: Credentials; userId: string }
    >;

    const managerToken = await signInUser(config, createdAccounts.manager.credentials);
    const organizationResponse = await request(config, '/rest/v1/rpc/bootstrap_organization', {
      method: 'POST',
      body: {
        p_name: `Organização E2E ${id}`,
        p_cnpj: '',
        p_address: 'Ambiente descartável de testes',
      },
      authorizationToken: managerToken,
    });
    organizationId = String(organizationResponse || '');
    if (!organizationId) throw new Error('Supabase did not return the test organization id.');

    await postgrest(
      config,
      'profiles',
      accountSpecs.map(([role, fullName]) => ({
        id: createdAccounts[role].userId,
        email: createdAccounts[role].credentials.email,
        full_name: fullName,
        default_organization_id: role === 'manager' ? organizationId : null,
      })),
      { query: '?on_conflict=id', prefer: 'resolution=merge-duplicates,return=representation' },
    );

    const professionals = await postgrest(config, 'professionals', [
      {
        name: 'Profissional operacional E2E',
        role: 'barbeiro',
        initials: 'PO',
        color: '#3b82f6',
        organization_id: organizationId,
      },
      {
        name: 'Profissional customizado E2E',
        role: 'e2e-custom',
        initials: 'PC',
        color: '#8b5cf6',
        organization_id: organizationId,
      },
      {
        name: 'Profissional convidado E2E',
        role: 'barbeiro',
        initials: 'PE',
        color: '#10b981',
        organization_id: organizationId,
      },
      {
        name: 'Profissional convite pendente E2E',
        role: 'barbeiro',
        initials: 'PP',
        color: '#f59e0b',
        organization_id: organizationId,
      },
      {
        name: 'Profissional convite expirado E2E',
        role: 'barbeiro',
        initials: 'PX',
        color: '#ef4444',
        organization_id: organizationId,
      },
      {
        name: 'Profissional convite revogado E2E',
        role: 'barbeiro',
        initials: 'PR',
        color: '#64748b',
        organization_id: organizationId,
      },
      {
        name: 'Profissional convite e-mail E2E',
        role: 'vendedor',
        initials: 'PE',
        color: '#14b8a6',
        organization_id: organizationId,
      },
    ], { authorizationToken: managerToken });
    if (professionals.length !== 7) throw new Error('Supabase did not create all E2E professionals.');
    const professionalIds = professionals.map(row => String(row.id));

    await postgrest(config, 'organization_members', [
      {
        organization_id: organizationId,
        user_id: createdAccounts.operational.userId,
        role: 'barbeiro',
        professional_id: professionalIds[0],
      },
      {
        organization_id: organizationId,
        user_id: createdAccounts.customRole.userId,
        role: 'e2e-custom',
        professional_id: professionalIds[1],
      },
      {
        organization_id: organizationId,
        user_id: createdAccounts.invited.userId,
        role: 'barbeiro',
        professional_id: professionalIds[2],
      },
    ], { authorizationToken: config.serviceRoleKey });

    await postgrest(config, 'organization_settings', {
      payload: {
        roles: [
          {
            key: 'e2e-custom',
            label: 'Papel customizado E2E',
            isActive: true,
            permissions: ['dashboard', 'agenda'],
          },
        ],
      },
    }, {
      method: 'PATCH',
      query: `?organization_id=eq.${encodeURIComponent(organizationId)}`,
      prefer: 'return=representation',
      authorizationToken: managerToken,
    });

    const now = Date.now();
    const pendingToken = token();
    const expiredToken = token();
    const revokedToken = token();
    const usedToken = token();
    const emailCheckToken = token();
    const future = (days: number) => new Date(now + days * 86_400_000).toISOString();
    const past = (days: number) => new Date(now - days * 86_400_000).toISOString();

    await createInvitation(config, {
      organizationId,
      professionalId: professionalIds[3],
      email: email('pending', id),
      invitedBy: createdAccounts.manager.userId,
      token: pendingToken,
      expiresAt: future(7),
    });
    await createInvitation(config, {
      organizationId,
      professionalId: professionalIds[4],
      email: createdAccounts.expired.credentials.email,
      invitedBy: createdAccounts.manager.userId,
      token: expiredToken,
      expiresAt: past(1),
    });
    await createInvitation(config, {
      organizationId,
      professionalId: professionalIds[5],
      email: createdAccounts.revoked.credentials.email,
      invitedBy: createdAccounts.manager.userId,
      token: revokedToken,
      expiresAt: future(7),
      revokedAt: new Date(now - 60_000).toISOString(),
    });
    await createInvitation(config, {
      organizationId,
      professionalId: professionalIds[2],
      email: createdAccounts.expired.credentials.email,
      invitedBy: createdAccounts.manager.userId,
      token: usedToken,
      expiresAt: future(7),
      acceptedAt: new Date(now - 60_000).toISOString(),
      acceptedBy: createdAccounts.invited.userId,
    });
    await createInvitation(config, {
      organizationId,
      professionalId: professionalIds[6],
      email: createdAccounts.invited.credentials.email,
      invitedBy: createdAccounts.manager.userId,
      token: emailCheckToken,
      expiresAt: future(7),
    });

    const manifest: E2EFixtureManifest = {
      organizationId,
      accounts: {
        manager: createdAccounts.manager.credentials,
        operational: createdAccounts.operational.credentials,
        customRole: createdAccounts.customRole.credentials,
        invited: createdAccounts.invited.credentials,
        onboarding: createdAccounts.onboarding.credentials,
        expired: createdAccounts.expired.credentials,
        revoked: createdAccounts.revoked.credentials,
      },
      invitationTokens: {
        pending: pendingToken,
        expired: expiredToken,
        revoked: revokedToken,
        used: usedToken,
        emailCheck: emailCheckToken,
      },
      userIds,
    };
    mkdirSync(dirname(config.fixtureFile), { recursive: true });
    writeFileSync(config.fixtureFile, `${JSON.stringify(manifest)}\n`, { encoding: 'utf8', mode: 0o600 });
    chmodSync(config.fixtureFile, 0o600);
  } catch (error) {
    await cleanupFixtures(config, { organizationId, userIds });
    throw error;
  }
}

export function readFixtureManifest(): E2EFixtureManifest | undefined {
  try {
    return JSON.parse(readFileSync(fixtureFile, 'utf8')) as E2EFixtureManifest;
  } catch {
    return undefined;
  }
}

export async function cleanupFixtures(
  config = getConfig(),
  partial: { organizationId?: string; userIds?: string[] } = {},
): Promise<void> {
  const manifest = readFixtureManifest();
  const userIds = [...new Set([...(partial.userIds || []), ...(manifest?.userIds || [])])];
  const organizationIds = new Set(
    [partial.organizationId, manifest?.organizationId].filter(
      (value): value is string => Boolean(value),
    ),
  );
  const cleanupErrors: string[] = [];

  if (userIds.length) {
    const ids = userIds.map(encodeURIComponent).join(',');
    const profiles = await request(
      config,
      `/rest/v1/profiles?id=in.(${ids})&select=default_organization_id`,
    ).catch(error => {
      cleanupErrors.push(`could not discover profile organizations: ${String(error)}`);
      return undefined;
    });
    if (Array.isArray(profiles)) {
      for (const profile of profiles) {
        if (profile && typeof profile === 'object') {
          const organizationId = (profile as Record<string, unknown>).default_organization_id;
          if (typeof organizationId === 'string') organizationIds.add(organizationId);
        }
      }
    }

    const memberships = await request(
      config,
      `/rest/v1/organization_members?user_id=in.(${ids})&select=organization_id`,
    ).catch(error => {
      cleanupErrors.push(`could not discover membership organizations: ${String(error)}`);
      return undefined;
    });
    if (Array.isArray(memberships)) {
      for (const membership of memberships) {
        if (membership && typeof membership === 'object') {
          const organizationId = (membership as Record<string, unknown>).organization_id;
          if (typeof organizationId === 'string') organizationIds.add(organizationId);
        }
      }
    }
  }

  for (const organizationId of organizationIds) {
    try {
      await request(
        config,
        `/rest/v1/organization_invitations?organization_id=eq.${encodeURIComponent(organizationId)}`,
        {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        },
      );
    } catch (error) {
      cleanupErrors.push(`could not delete organization invitations ${organizationId}: ${String(error)}`);
    }
  }

  await Promise.all(
    userIds.map(async userId => {
      try {
        await request(config, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
          method: 'DELETE',
        });
      } catch (error) {
        cleanupErrors.push(`could not delete user ${userId}: ${String(error)}`);
      }
    }),
  );

  for (const organizationId of organizationIds) {
    try {
      await request(config, `/rest/v1/organizations?id=eq.${encodeURIComponent(organizationId)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
    } catch (error) {
      cleanupErrors.push(`could not delete organization ${organizationId}: ${String(error)}`);
    }
  }
  rmSync(config.fixtureFile, { force: true });
  if (cleanupErrors.length) {
    throw new Error(`E2E fixture cleanup failed:\n${cleanupErrors.join('\n')}`);
  }
}

export function getFixtureFile() {
  return fixtureFile;
}