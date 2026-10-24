import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { build } from 'esbuild';
import test, { after, afterEach, before, beforeEach } from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const previousFetch = globalThis.fetch;
const organizationId = '00000000-0000-4000-8000-000000000001';
const grantTime = '2026-10-21T12:00:00.000Z';

let generatedDirectory;
let managerRouter;
let server;
let serverUrl;
let users;
let profiles;
let memberships;
let adminRequests;
let callerRole;

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mockSupabaseFetch(input, init = {}) {
  const url = new URL(String(input));
  const headers = new Headers(init.headers);
  const authorization = headers.get('Authorization');
  const isAdmin = authorization === 'Bearer test-service-role-key';

  if (url.pathname === '/auth/v1/user') {
    if (authorization !== 'Bearer valid-manager-session') return jsonResponse({ message: 'Invalid token' }, 401);
    return jsonResponse({ id: 'manager-user' });
  }

  if (url.pathname === '/rest/v1/organization_members' && !isAdmin) {
    assert.equal(authorization, 'Bearer valid-manager-session');
    return jsonResponse(
      callerRole && url.searchParams.get('organization_id') === `eq.${organizationId}`
        ? [{ role: callerRole }]
        : [],
    );
  }

  if (url.pathname === '/auth/v1/admin/users' && isAdmin) {
    adminRequests.push({ method: 'list-users' });
    const email = url.searchParams.get('email');
    const matchingUsers = users.filter(user => !email || user.email?.toLowerCase() === email.toLowerCase());
    return jsonResponse({ users: matchingUsers });
  }

  if (url.pathname === '/rest/v1/profiles' && isAdmin && init.method === 'GET') {
    const userId = url.searchParams.get('id')?.slice(3);
    return jsonResponse(profiles.has(userId) ? [{ id: userId }] : []);
  }

  if (url.pathname === '/rest/v1/profiles' && isAdmin && init.method === 'POST') {
    const body = JSON.parse(init.body);
    adminRequests.push({ method: 'insert-profile', body });
    profiles.set(body.id, body);
    return jsonResponse([]);
  }

  if (url.pathname === '/rest/v1/organization_members' && isAdmin && init.method === 'GET') {
    const userId = url.searchParams.get('user_id')?.slice(3);
    return jsonResponse(memberships.get(userId) ?? []);
  }

  if (url.pathname === '/rest/v1/organization_members' && isAdmin && init.method === 'POST') {
    const body = JSON.parse(init.body);
    adminRequests.push({ method: 'insert-membership', body });
    const inserted = {
      organization_id: body.organization_id,
      user_id: body.user_id,
      role: body.role,
      is_active: body.is_active,
      granted_by: body.granted_by,
      granted_by_name: profiles.get(body.granted_by)?.full_name ?? 'Gestor Responsável',
      granted_at: grantTime,
    };
    memberships.set(body.user_id, [inserted]);
    return jsonResponse([inserted]);
  }

  throw new Error(`Unexpected Supabase request in test: ${init.method ?? 'GET'} ${url.href}`);
}

async function sendRequest({ body, token = 'valid-manager-session' } = {}) {
  const response = await previousFetch(`${serverUrl}/admin/organization-managers`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Origin: serverUrl,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? { email: 'existing@example.test', organizationId }),
  });
  return { response, body: await response.json() };
}

before(async () => {
  generatedDirectory = await mkdtemp(path.join(here, '.generated-manager-'));
  const routeOutput = path.join(generatedDirectory, 'organization-manager-provisioning.mjs');
  await build({
    entryPoints: [path.join(root, 'artifacts/api-server/src/routes/dev-admin-provisioning.ts')],
    outfile: routeOutput,
    bundle: true,
    platform: 'node',
    format: 'esm',
    external: ['express'],
    alias: {
      '@workspace/api-zod': path.join(root, 'lib/api-zod/src/generated/api.ts'),
    },
    sourcemap: false,
  });
  ({ default: managerRouter } = await import(pathToFileURL(routeOutput).href));
});

beforeEach(async () => {
  process.env.VITE_SUPABASE_URL = 'https://supabase.test';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.E2E_SUPABASE_TEST_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.NODE_ENV = 'test';
  globalThis.fetch = mockSupabaseFetch;
  users = [{
    id: 'existing-user',
    email: 'existing@example.test',
    user_metadata: { full_name: 'Conta Existente' },
  }];
  profiles = new Map([['manager-user', { id: 'manager-user', full_name: 'Gestor Responsável' }]]);
  memberships = new Map();
  adminRequests = [];
  callerRole = 'gestor';

  const app = express();
  app.use(express.json());
  app.use(managerRouter);
  server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  serverUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  globalThis.fetch = previousFetch;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

after(async () => {
  if (generatedDirectory) await rm(generatedDirectory, { recursive: true, force: true });
});

test('repairs a missing profile and grants an audited active manager membership to an existing Auth account', async () => {
  const { response, body } = await sendRequest();

  assert.equal(response.status, 200);
  assert.equal(body.email, 'existing@example.test');
  assert.equal(body.fullName, 'Conta Existente');
  assert.equal(body.createdProfile, true);
  assert.equal(body.membershipCreated, true);
  assert.equal(body.grantedAt, grantTime);
  assert.equal(profiles.get('existing-user').full_name, 'Conta Existente');
  assert.deepEqual(memberships.get('existing-user'), [{
    organization_id: organizationId,
    user_id: 'existing-user',
    role: 'gestor',
    is_active: true,
    granted_by: 'manager-user',
    granted_by_name: 'Gestor Responsável',
    granted_at: grantTime,
  }]);
  assert.equal(adminRequests.some(request => request.method === 'insert-profile'), true);
  assert.equal(adminRequests.some(request => request.method === 'insert-membership'), true);
  assert.equal(adminRequests.some(request => request.method.includes('password')), false);
  assert.equal(JSON.stringify(body).toLowerCase().includes('password'), false);
});

test('does not grant manager access to a caller who is not a Gestor', async () => {
  callerRole = 'dev-admin';

  const { response } = await sendRequest();

  assert.equal(response.status, 403);
  assert.equal(adminRequests.length, 0);
});

test('does not accept another organization selected by the caller', async () => {
  const { response } = await sendRequest({
    body: {
      email: 'existing@example.test',
      organizationId: '00000000-0000-4000-8000-000000000002',
    },
  });

  assert.equal(response.status, 403);
  assert.equal(adminRequests.length, 0);
});

test('does not create an account when the Auth identity does not exist', async () => {
  users = [];

  const { response } = await sendRequest();

  assert.equal(response.status, 404);
  assert.equal(adminRequests.some(request => request.method === 'insert-profile'), false);
  assert.equal(adminRequests.some(request => request.method === 'insert-membership'), false);
});

test('does not replace an existing active or historical organization membership', async () => {
  memberships.set('existing-user', [{
    organization_id: organizationId,
    role: 'barbeiro',
    is_active: false,
  }]);

  const { response } = await sendRequest();

  assert.equal(response.status, 409);
  assert.equal(adminRequests.some(request => request.method === 'insert-profile'), false);
  assert.equal(adminRequests.some(request => request.method === 'insert-membership'), false);
});

test('rejects invalid email input', async () => {
  const { response } = await sendRequest({
    body: { email: 'invalid', organizationId },
  });

  assert.equal(response.status, 400);
  assert.equal(adminRequests.length, 0);
});
