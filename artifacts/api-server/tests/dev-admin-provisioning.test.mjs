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

let generatedDirectory;
let provisioningRouter;
let server;
let serverUrl;
let users;
let profiles;
let memberships;
let generatedLinks;
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
    if (authorization !== 'Bearer valid-manager-session') {
      return jsonResponse({ message: 'Invalid token' }, 401);
    }
    return jsonResponse({ id: 'manager-user' });
  }

  if (url.pathname === '/rest/v1/organization_members' && !isAdmin) {
    assert.equal(authorization, 'Bearer valid-manager-session');
    const requestedOrganization = url.searchParams.get('organization_id');
    return jsonResponse(callerRole && requestedOrganization === `eq.${organizationId}` ? [{ role: callerRole }] : []);
  }

  if (url.pathname === '/auth/v1/admin/users' && isAdmin) {
    adminRequests.push({ method: 'list-users', page: Number(url.searchParams.get('page')) });
    return jsonResponse({ users });
  }

  if (url.pathname === '/auth/v1/admin/generate_link' && isAdmin) {
    const body = JSON.parse(init.body);
    generatedLinks.push(body);
    let user = users.find(item => item.email === body.email);
    if (body.type === 'invite' && !user) {
      user = { id: 'new-user-id', email: body.email };
      users.push(user);
      profiles.add(user.id);
    }
    if (!user) return jsonResponse({ message: 'User not found' }, 404);
    return jsonResponse({
      id: user.id,
      email: user.email,
      action_link: `https://supabase.test/auth/v1/verify?type=${body.type}&redirect_to=${encodeURIComponent(url.searchParams.get('redirect_to'))}`,
    });
  }

  if (url.pathname === '/rest/v1/profiles' && isAdmin) {
    const userId = url.searchParams.get('id')?.slice(3);
    return jsonResponse(profiles.has(userId) ? [{ id: userId }] : []);
  }

  if (url.pathname === '/rest/v1/organization_members' && init.method !== 'POST' && isAdmin) {
    const userId = url.searchParams.get('user_id')?.slice(3);
    return jsonResponse(memberships.get(userId) ?? []);
  }

  if (url.pathname === '/rest/v1/organization_members' && init.method === 'POST' && isAdmin) {
    const membership = JSON.parse(init.body);
    adminRequests.push({ method: 'insert-membership', membership });
    memberships.set(membership.user_id, [{
      organization_id: membership.organization_id,
      role: membership.role,
      is_active: membership.is_active,
    }]);
    return jsonResponse([]);
  }

  if (url.pathname.startsWith('/auth/v1/admin/users/') && init.method === 'DELETE' && isAdmin) {
    const userId = url.pathname.split('/').pop();
    users = users.filter(item => item.id !== userId);
    profiles.delete(userId);
    return new Response(null, { status: 204 });
  }

  throw new Error(`Unexpected Supabase request in test: ${init.method ?? 'GET'} ${url.href}`);
}

async function sendRequest({ body, token = 'valid-manager-session', origin = serverUrl } = {}) {
  const response = await previousFetch(`${serverUrl}/admin/dev-admins`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? { email: 'admin@example.test', organizationId }),
  });
  return { response, body: await response.json() };
}

before(async () => {
  generatedDirectory = await mkdtemp(path.join(here, '.generated-'));
  const routeOutput = path.join(generatedDirectory, 'dev-admin-provisioning.mjs');
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
  ({ default: provisioningRouter } = await import(pathToFileURL(routeOutput).href));
});

beforeEach(async () => {
  process.env.VITE_SUPABASE_URL = 'https://supabase.test';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.E2E_SUPABASE_TEST_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.NODE_ENV = 'test';
  globalThis.fetch = mockSupabaseFetch;
  users = [];
  profiles = new Set();
  memberships = new Map();
  generatedLinks = [];
  adminRequests = [];
  callerRole = 'gestor';

  const app = express();
  app.use(express.json());
  app.use(provisioningRouter);
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

test('creates a Supabase identity, DEV/ADMIN membership, and one secure invite link', async () => {
  const { response, body } = await sendRequest();

  assert.equal(response.status, 200);
  assert.equal(body.createdIdentity, true);
  assert.equal(body.membershipCreated, true);
  assert.equal(body.organizationId, organizationId);
  assert.match(body.actionLink, /type=invite/);
  assert.deepEqual(generatedLinks.map(link => link.type), ['invite']);
  assert.deepEqual(memberships.get('new-user-id'), [{
    organization_id: organizationId,
    role: 'dev-admin',
    is_active: true,
  }]);
  assert.equal(adminRequests.some(request => request.method === 'insert-membership'), true);
  assert.equal(adminRequests.some(request => request.method === 'update-profile-context'), false);
  assert.equal(JSON.stringify(body).includes('password'), false);
});

test('reuses an existing identity and preserves its existing DEV/ADMIN membership', async () => {
  users = [{ id: 'existing-user', email: 'admin@example.test' }];
  profiles.add('existing-user');
  memberships.set('existing-user', [{
    organization_id: organizationId,
    role: 'dev-admin',
    is_active: true,
  }]);

  const { response, body } = await sendRequest();

  assert.equal(response.status, 200);
  assert.equal(body.createdIdentity, false);
  assert.equal(body.membershipCreated, false);
  assert.match(body.actionLink, /type=recovery/);
  assert.deepEqual(generatedLinks.map(link => link.type), ['recovery']);
  assert.equal(adminRequests.some(request => request.method === 'insert-membership'), false);
});

test('does not grant access to a caller without a manager role', async () => {
  callerRole = 'barbeiro';

  const { response } = await sendRequest();

  assert.equal(response.status, 403);
  assert.equal(adminRequests.length, 0);
  assert.equal(generatedLinks.length, 0);
});

test('does not allow a manager to choose another organization', async () => {
  const otherOrganizationId = '00000000-0000-4000-8000-000000000002';
  const { response } = await sendRequest({
    body: { email: 'admin@example.test', organizationId: otherOrganizationId },
  });

  assert.equal(response.status, 403);
  assert.equal(adminRequests.length, 0);
  assert.equal(generatedLinks.length, 0);
});

test('does not move or replace an account that has an active membership elsewhere', async () => {
  users = [{ id: 'existing-user', email: 'admin@example.test' }];
  profiles.add('existing-user');
  memberships.set('existing-user', [{
    organization_id: '00000000-0000-4000-8000-000000000002',
    role: 'gestor',
    is_active: true,
  }]);

  const { response } = await sendRequest();

  assert.equal(response.status, 409);
  assert.equal(generatedLinks.length, 0);
  assert.equal(adminRequests.some(request => request.method === 'insert-membership'), false);
});

test('rejects invalid input and a redirect origin that does not match the application host', async () => {
  const invalidEmail = await sendRequest({ body: { email: 'not-an-email', organizationId } });
  assert.equal(invalidEmail.response.status, 400);

  const foreignOrigin = await sendRequest({ origin: 'https://attacker.example' });
  assert.equal(foreignOrigin.response.status, 400);
  assert.equal(adminRequests.length, 0);
});
