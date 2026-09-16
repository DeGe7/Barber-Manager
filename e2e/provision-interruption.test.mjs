import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const provisionModule = pathToFileURL(resolve(root, 'e2e/provision.ts')).href;
const preload = resolve(root, 'e2e/mock-supabase-fetch.mjs');
const testSupabaseUrl = 'https://test-project.supabase.co';

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : undefined;
}

async function createMockSupabase() {
  const users = new Map();
  const organizations = new Map();
  const profiles = new Map();
  const memberships = [];
  const events = [];
  let userNumber = 0;
  let organizationNumber = 0;
  let professionalNumber = 0;
  let invitationNumber = 0;
  let failOrganizationDeletion = false;

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      const body = request.method === 'GET' ? undefined : await requestBody(request);

      if (url.pathname === '/auth/v1/admin/users' && request.method === 'POST') {
        const id = `user-${++userNumber}`;
        users.set(id, { id, email: body?.email });
        events.push({ type: 'create-user', id });
        return json(response, 200, { id });
      }

      if (url.pathname.startsWith('/auth/v1/admin/users/') && request.method === 'DELETE') {
        const id = decodeURIComponent(url.pathname.split('/').pop());
        users.delete(id);
        events.push({ type: 'delete-user', id });
        return json(response, 200, {});
      }

      if (url.pathname === '/auth/v1/token' && request.method === 'POST') {
        return json(response, 200, { access_token: 'mock-manager-token' });
      }

      if (
        url.pathname === '/rest/v1/rpc/bootstrap_organization' &&
        request.method === 'POST'
      ) {
        const id = `organization-${++organizationNumber}`;
        organizations.set(id, { id });
        events.push({ type: 'create-organization', id });
        return json(response, 200, id);
      }

      if (url.pathname.startsWith('/rest/v1/')) {
        const table = url.pathname.slice('/rest/v1/'.length);

        if (request.method === 'GET') {
          if (table === 'schema_metadata') {
            return json(response, 200, [{ key: 'app_schema_version' }]);
          }
          if (table === 'profiles') {
            const ids = url.searchParams.get('id')?.match(/^in\((.*)\)$/)?.[1]?.split(',') || [];
            return json(
              response,
              200,
              [...profiles.values()].filter(profile => ids.includes(profile.id)),
            );
          }
          if (table === 'organization_members') {
            const userFilter = url.searchParams.get('user_id') || '';
            const ids = userFilter.match(/^in\((.*)\)$/)?.[1]?.split(',') || [];
            const exactUserId = userFilter.startsWith('eq.') ? userFilter.slice(3) : undefined;
            return json(
              response,
              200,
              memberships.filter(membership => (
                ids.includes(membership.user_id) || membership.user_id === exactUserId
              )),
            );
          }
          return json(response, 200, []);
        }

        if (request.method === 'POST') {
          if (table === 'profiles') {
            for (const profile of Array.isArray(body) ? body : [body]) {
              if (profile?.id) profiles.set(profile.id, profile);
            }
          }
          if (table === 'organization_members') {
            memberships.push(...(Array.isArray(body) ? body : [body]));
          }
          if (table === 'professionals') {
            return json(
              response,
              200,
              (Array.isArray(body) ? body : [body]).map(row => ({
                ...row,
                id: `professional-${++professionalNumber}`,
              })),
            );
          }
          if (table === 'organization_invitations') {
            return json(
              response,
              200,
              (Array.isArray(body) ? body : [body]).map(row => ({
                ...row,
                id: `invitation-${++invitationNumber}`,
              })),
            );
          }
          return json(response, 200, Array.isArray(body) ? body : body ? [body] : []);
        }

        if (request.method === 'PATCH') return json(response, 200, []);

        if (request.method === 'DELETE') {
          if (table === 'organizations') {
            const id = url.searchParams.get('id')?.replace('eq.', '');
            if (failOrganizationDeletion) {
              return json(response, 500, { message: 'mock organization deletion failure' });
            }
            organizations.delete(id);
            events.push({ type: 'delete-organization', id });
          }
          return json(response, 200, []);
        }
      }

      return json(response, 404, { message: `Unhandled mock request: ${request.method} ${url}` });
    } catch (error) {
      return json(response, 500, { message: String(error) });
    }
  });

  await new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveServer);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Mock Supabase did not expose a port.');

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    events,
    users,
    organizations,
    memberships,
    set failOrganizationDeletion(value) {
      failOrganizationDeletion = value;
    },
    async close() {
      await new Promise((resolveClose, reject) => {
        server.close(error => (error ? reject(error) : resolveClose()));
      });
    },
  };
}

function fixturePaths(directory) {
  const fixtureFile = join(directory, 'fixtures.json');
  return { fixtureFile, stateFile: `${fixtureFile}.pending` };
}

function childEnvironment(paths, mock, extra = {}) {
  return {
    ...process.env,
    E2E_PROVISION: 'true',
    E2E_SUPABASE_TEST_URL: testSupabaseUrl,
    E2E_SUPABASE_TEST_SERVICE_ROLE_KEY: 'mock-service-role-key',
    E2E_SUPABASE_PRODUCTION_URL: 'https://production-project.supabase.co',
    E2E_FIXTURE_FILE: paths.fixtureFile,
    E2E_FIXTURE_STATE_FILE: paths.stateFile,
    E2E_MOCK_SUPABASE_BASE_URL: mock.baseUrl,
    ...extra,
  };
}

function runProvision(paths, mock, extra = {}, action = 'provision') {
  const expression =
    action === 'cleanup'
      ? `import { cleanupFixtures } from ${JSON.stringify(provisionModule)}; await cleanupFixtures();`
      : action === 'scenario-cleanup'
        ? `import { beginScenarioSnapshot, cleanupScenarioFixtures } from ${JSON.stringify(provisionModule)}; await cleanupScenarioFixtures(beginScenarioSnapshot());`
      : `import { provisionFixtures } from ${JSON.stringify(provisionModule)}; await provisionFixtures();`;
  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', '--import', preload, '--input-type=module', '-e', expression],
    {
      cwd: root,
      env: childEnvironment(paths, mock, extra),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stderr = '';
  child.stderr.on('data', chunk => {
    stderr += chunk;
  });
  return {
    child,
    result: new Promise(resolveResult => {
      child.once('close', (code, signal) => resolveResult({ code, signal, stderr }));
    }),
  };
}

async function waitForState(stateFile, predicate) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const state = JSON.parse(await readFile(stateFile, 'utf8'));
      if (predicate(state)) return state;
    } catch {
      // The state file is written atomically from the test's perspective.
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 20));
  }
  throw new Error(`Timed out waiting for E2E cleanup state: ${stateFile}`);
}

async function interruptProvision(paths, mock, checkpoint) {
  const run = runProvision(
    paths,
    mock,
    { E2E_PROVISION_PAUSE_AFTER: checkpoint },
  );
  const state = await waitForState(paths.stateFile, current =>
    checkpoint === 'users'
      ? current.userIds?.length === 7 && !current.organizationId
      : current.userIds?.length === 7 && Boolean(current.organizationId),
  );
  run.child.kill('SIGTERM');
  const result = await run.result;
  assert.equal(result.signal, 'SIGTERM', result.stderr);
  return state;
}

async function readIfPresent(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function assertRecoveredFromInterruption(checkpoint) {
  const directory = await mkdtemp(join(tmpdir(), 'barber-e2e-provision-'));
  const paths = fixturePaths(directory);
  const mock = await createMockSupabase();
  try {
    const interruptedState = await interruptProvision(paths, mock, checkpoint);
    const staleUserIds = [...interruptedState.userIds];
    const staleOrganizationId = interruptedState.organizationId;
    assert.equal(await readIfPresent(paths.fixtureFile), undefined);

    const firstRecoveryEvent = mock.events.length;
    const recovery = runProvision(paths, mock);
    const recoveryResult = await recovery.result;
    assert.equal(recoveryResult.code, 0, recoveryResult.stderr);
    assert.equal(await readIfPresent(paths.stateFile), undefined);
    assert.notEqual(await readIfPresent(paths.fixtureFile), undefined);

    const recoveryEvents = mock.events.slice(firstRecoveryEvent);
    const firstNewUser = recoveryEvents.findIndex(event => event.type === 'create-user');
    assert.notEqual(firstNewUser, -1);
    for (const userId of staleUserIds) {
      assert.equal(mock.users.has(userId), false, `stale user ${userId} was not removed`);
      const deletionIndex = recoveryEvents.findIndex(
        event => event.type === 'delete-user' && event.id === userId,
      );
      assert.notEqual(deletionIndex, -1, `stale user ${userId} was not deleted`);
      assert.ok(deletionIndex < firstNewUser, `stale user ${userId} was deleted too late`);
    }
    if (staleOrganizationId) {
      const deletionIndex = recoveryEvents.findIndex(
        event => event.type === 'delete-organization' && event.id === staleOrganizationId,
      );
      assert.notEqual(deletionIndex, -1, `stale organization ${staleOrganizationId} was not deleted`);
      assert.ok(deletionIndex < firstNewUser, 'stale organization was deleted too late');
      assert.equal(mock.organizations.has(staleOrganizationId), false);
    }

    const cleanup = runProvision(paths, mock, {}, 'cleanup');
    const cleanupResult = await cleanup.result;
    assert.equal(cleanupResult.code, 0, cleanupResult.stderr);
    assert.equal(await readIfPresent(paths.fixtureFile), undefined);
    assert.equal(await readIfPresent(paths.stateFile), undefined);
    assert.equal(mock.users.size, 0);
    assert.equal(mock.organizations.size, 0);
  } finally {
    await mock.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test('recovers automatically after interruption following user creation', async () => {
  await assertRecoveredFromInterruption('users');
});

test('cleans the onboarding organization without touching shared fixture organizations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'barber-e2e-provision-'));
  const paths = fixturePaths(directory);
  const mock = await createMockSupabase();
  try {
    const provision = runProvision(paths, mock);
    const provisionResult = await provision.result;
    assert.equal(provisionResult.code, 0, provisionResult.stderr);

    const manifest = JSON.parse(await readFile(paths.fixtureFile, 'utf8'));
    const onboardingOrganizationId = 'organization-onboarding';
    const unrelatedOrganizationId = 'organization-unrelated';
    mock.organizations.set(onboardingOrganizationId, { id: onboardingOrganizationId });
    mock.organizations.set(unrelatedOrganizationId, { id: unrelatedOrganizationId });
    mock.memberships.push(
      {
        organization_id: onboardingOrganizationId,
        user_id: manifest.onboardingUserId,
      },
      {
        organization_id: unrelatedOrganizationId,
        user_id: 'user-not-in-fixture',
      },
    );

    const scenarioCleanup = runProvision(paths, mock, {}, 'scenario-cleanup');
    const cleanupResult = await scenarioCleanup.result;
    assert.equal(cleanupResult.code, 0, cleanupResult.stderr);
    assert.equal(mock.organizations.has(onboardingOrganizationId), false);
    assert.equal(mock.organizations.has(unrelatedOrganizationId), true);
    assert.equal(mock.organizations.has(manifest.organizationId), true);
    assert.equal(mock.users.size, 7);
  } finally {
    await mock.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('recovers automatically after interruption following organization creation', async () => {
  await assertRecoveredFromInterruption('organization');
});

test('keeps pending manifests when cleanup fails and retries them later', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'barber-e2e-provision-'));
  const paths = fixturePaths(directory);
  const mock = await createMockSupabase();
  try {
    await interruptProvision(paths, mock, 'organization');
    mock.failOrganizationDeletion = true;

    const failedRecovery = runProvision(paths, mock);
    const failedRecoveryResult = await failedRecovery.result;
    assert.notEqual(failedRecoveryResult.code, 0);
    assert.notEqual(await readIfPresent(paths.stateFile), undefined);
    assert.equal(await readIfPresent(paths.fixtureFile), undefined);

    mock.failOrganizationDeletion = false;
    const recovery = runProvision(paths, mock);
    const recoveryResult = await recovery.result;
    assert.equal(recoveryResult.code, 0, recoveryResult.stderr);
    assert.equal(await readIfPresent(paths.stateFile), undefined);
    assert.notEqual(await readIfPresent(paths.fixtureFile), undefined);

    mock.failOrganizationDeletion = true;
    const failedCleanup = runProvision(paths, mock, {}, 'cleanup');
    const failedCleanupResult = await failedCleanup.result;
    assert.notEqual(failedCleanupResult.code, 0);
    assert.notEqual(await readIfPresent(paths.fixtureFile), undefined);

    mock.failOrganizationDeletion = false;
    const cleanup = runProvision(paths, mock, {}, 'cleanup');
    const cleanupResult = await cleanup.result;
    assert.equal(cleanupResult.code, 0, cleanupResult.stderr);
    assert.equal(await readIfPresent(paths.fixtureFile), undefined);
    assert.equal(await readIfPresent(paths.stateFile), undefined);
  } finally {
    await mock.close();
    await rm(directory, { recursive: true, force: true });
  }
});