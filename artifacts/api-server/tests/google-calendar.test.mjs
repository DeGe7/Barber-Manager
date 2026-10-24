import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { ReplitConnectors } from '@replit/connectors-sdk';
import { build } from 'esbuild';
import test, { after, afterEach, before, beforeEach } from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const apiSource = path.join(root, 'artifacts/barber-manager/src/data/api.ts');
const clientStub = path.join(here, 'api-client-stubs.mjs');
const previousFetch = globalThis.fetch;
const originalProxy = ReplitConnectors.prototype.proxy;
const originalEnvironment = {
  supabaseUrl: process.env.VITE_SUPABASE_URL,
  anonKey: process.env.VITE_SUPABASE_ANON_KEY,
};

let generatedDirectory;
let googleRouter;
let browserApi;
let server;
let serverUrl;
let appointments;
let googleEvents;
let googleCalls;
let browserRequests;
let invalidSession;
let failedGoogleEventIds;

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function eventIdFor(appointmentId) {
  return createHash('sha256').update(appointmentId).digest('hex');
}

function appointment(overrides = {}) {
  return {
    id: 'appointment-1',
    date: '2026-09-30',
    time: '10:30',
    client: 'Cliente do Supabase',
    professional_id: 'professional-1',
    service: 'Corte do Supabase',
    duration: 30,
    status: 'confirmed',
    ...overrides,
  };
}

async function mockSupabaseFetch(input, init = {}) {
  const url = new URL(String(input));
  const authorization = new Headers(init.headers).get('Authorization');

  if (url.pathname === '/auth/v1/user') {
    if (invalidSession || authorization === 'Bearer expired-supabase-session') {
      return jsonResponse({ message: 'Invalid token' }, 401);
    }
    assert.equal(authorization, 'Bearer valid-supabase-session');
    return jsonResponse({ id: 'test-user' });
  }

  if (url.pathname === '/rest/v1/appointments') {
    assert.equal(authorization, 'Bearer valid-supabase-session');
    const filter = url.searchParams.get('id') ?? '';
    const ids = filter.startsWith('in.(')
      ? filter.slice(4, -1).split(',')
      : filter.startsWith('eq.')
        ? [filter.slice(3)]
        : [];
    return jsonResponse(appointments.filter((row) => ids.includes(row.id)));
  }

  throw new Error(`Unexpected external fetch in test: ${url.href}`);
}

async function mockGoogleCalendar(connectorName, requestPath, options = {}) {
  assert.equal(connectorName, 'google-calendar');
  const method = options.method ?? 'GET';
  const normalizedPath = requestPath.split('?')[0];
  const eventMatch = /\/events\/([^/]+)$/.exec(normalizedPath);
  const eventId = eventMatch ? decodeURIComponent(eventMatch[1]) : undefined;
  const body = options.body ? JSON.parse(options.body) : undefined;
  googleCalls.push({ method, path: requestPath, body });

  if (method === 'GET') {
    if (failedGoogleEventIds.has(eventId)) {
      return jsonResponse({ error: 'temporary Google failure' }, 503);
    }
    const existing = googleEvents.get(eventId);
    return existing ? jsonResponse({ id: eventId, status: 'confirmed' }) : new Response(null, { status: 404 });
  }

  if (method === 'POST') {
    if (googleEvents.has(body.id)) return jsonResponse({ error: 'duplicate event' }, 409);
    googleEvents.set(body.id, body);
    return jsonResponse({
      id: body.id,
      htmlLink: `https://calendar.google.test/events/${body.id}`,
    });
  }

  if (method === 'PATCH') {
    const current = googleEvents.get(eventId) ?? {};
    const updated = { ...current, ...body };
    googleEvents.set(eventId, updated);
    return jsonResponse({
      id: eventId,
      htmlLink: `https://calendar.google.test/events/${eventId}`,
    });
  }

  if (method === 'DELETE') {
    googleEvents.delete(eventId);
    return new Response(null, { status: 204 });
  }

  throw new Error(`Unexpected Google Calendar method in test: ${method}`);
}

async function sendApiRequest(route, { method = 'POST', body, token = 'valid-supabase-session' } = {}) {
  const response = await previousFetch(`${serverUrl}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const responseBody = response.status === 204 ? undefined : await response.json();
  return { response, body: responseBody };
}

before(async () => {
  generatedDirectory = await mkdtemp(path.join(here, '.generated-'));
  const routeOutput = path.join(generatedDirectory, 'google-calendar.mjs');
  const clientOutput = path.join(generatedDirectory, 'api-client.mjs');

  await build({
    entryPoints: [path.join(root, 'artifacts/api-server/src/routes/google-calendar.ts')],
    outfile: routeOutput,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    sourcemap: false,
  });
  await build({
    entryPoints: [apiSource],
    outfile: clientOutput,
    bundle: true,
    platform: 'browser',
    format: 'esm',
    alias: {
      '@/services/supabaseClient': clientStub,
      '@/services/storage': clientStub,
    },
    sourcemap: false,
  });

  ({ default: googleRouter } = await import(pathToFileURL(routeOutput).href));
  ({ api: browserApi } = await import(pathToFileURL(clientOutput).href));
});

beforeEach(async () => {
  process.env.VITE_SUPABASE_URL = 'https://supabase.test';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';
  appointments = [appointment()];
  googleEvents = new Map();
  googleCalls = [];
  browserRequests = [];
  invalidSession = false;
  failedGoogleEventIds = new Set();

  globalThis.fetch = async (input, init) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      browserRequests.push({
        path: input,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return previousFetch(`${serverUrl}${input}`, init);
    }

    const url = new URL(String(input));
    if (url.hostname === 'supabase.test') return mockSupabaseFetch(input, init);
    return previousFetch(input, init);
  };
  ReplitConnectors.prototype.proxy = mockGoogleCalendar;

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { error() {} };
    next();
  });
  app.use('/api', googleRouter);
  server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  serverUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

after(async () => {
  globalThis.fetch = previousFetch;
  ReplitConnectors.prototype.proxy = originalProxy;
  if (originalEnvironment.supabaseUrl === undefined) delete process.env.VITE_SUPABASE_URL;
  else process.env.VITE_SUPABASE_URL = originalEnvironment.supabaseUrl;
  if (originalEnvironment.anonKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY;
  else process.env.VITE_SUPABASE_ANON_KEY = originalEnvironment.anonKey;
  await rm(generatedDirectory, { recursive: true, force: true });
});

test('rejeita uma sessão Supabase inválida antes de consultar dados ou chamar o Google', async () => {
  invalidSession = true;

  const { response } = await sendApiRequest('/api/google-calendar/appointments/appointment-1/sync');

  assert.equal(response.status, 401);
  assert.equal(googleCalls.length, 0);
});

test('respeita a visibilidade por RLS quando o agendamento não é retornado pelo Supabase', async () => {
  const { response, body } = await sendApiRequest('/api/google-calendar/appointments/out-of-scope/sync');

  assert.equal(response.status, 404);
  assert.match(body.error, /sem permissão/);
  assert.equal(googleCalls.length, 0);
});

test('sincroniza repetidamente sem duplicar o evento e não expõe token Google ao cliente web', async () => {
  const first = await browserApi.googleCalendar.syncAppointment('appointment-1');
  const second = await browserApi.googleCalendar.syncAppointment('appointment-1');

  assert.deepEqual(first, {
    synced: true,
    eventLink: `https://calendar.google.test/events/${eventIdFor('appointment-1')}`,
  });
  assert.deepEqual(second, first);
  assert.deepEqual(browserRequests.map((request) => request.body), [undefined, undefined]);
  assert.equal(googleCalls.filter((call) => call.method === 'POST').length, 1);
  assert.equal(googleCalls.filter((call) => call.method === 'PATCH').length, 1);
  assert.equal(googleEvents.size, 1);
  assert.deepEqual(Object.keys(first).sort(), ['eventLink', 'synced']);
  assert.equal(JSON.stringify(first).toLowerCase().includes('token'), false);
});

test('usa os dados do Supabase, não valores forjados pelo navegador, e sincroniza edição, cancelamento e exclusão', async () => {
  const route = '/api/google-calendar/appointments/appointment-1/sync';
  const forged = await sendApiRequest(route, {
    body: {
      client: 'Cliente forjado pelo navegador',
      service: 'Serviço forjado pelo navegador',
      date: '2099-01-01',
      time: '23:59',
      duration: 999,
      status: 'confirmed',
    },
  });

  assert.equal(forged.response.status, 200);
  const eventId = eventIdFor('appointment-1');
  let event = googleEvents.get(eventId);
  assert.match(event.summary, /Cliente do Supabase/);
  assert.doesNotMatch(JSON.stringify(event), /forjado pelo navegador/);
  assert.match(event.start.dateTime, /^2026-09-30T10:30:00/);

  appointments = [appointment({
    client: 'Cliente atualizado no Supabase',
    date: '2026-10-01',
    time: '11:15',
  })];
  await sendApiRequest(route);
  event = googleEvents.get(eventId);
  assert.match(event.summary, /Cliente atualizado no Supabase/);
  assert.match(event.start.dateTime, /^2026-10-01T11:15:00/);

  appointments = [appointment({
    client: 'Cliente atualizado no Supabase',
    date: '2026-10-01',
    time: '11:15',
    status: 'cancelled',
  })];
  await sendApiRequest(route);
  event = googleEvents.get(eventId);
  assert.match(event.summary, /^\[CANCELADO\]/);
  assert.equal(event.transparency, 'transparent');

  const deletion = await sendApiRequest('/api/google-calendar/appointments/appointment-1', { method: 'DELETE' });
  assert.equal(deletion.response.status, 204);
  assert.equal(googleEvents.has(eventId), false);
  assert.equal(googleCalls.at(-1).method, 'DELETE');
});

test('continua o lote após uma falha e retorna o resultado parcial', async () => {
  appointments = [appointment({ id: 'batch-good' }), appointment({ id: 'batch-broken' })];
  failedGoogleEventIds.add(eventIdFor('batch-broken'));

  const { response, body } = await sendApiRequest('/api/google-calendar/sync', {
    body: {
      appointmentIds: ['batch-broken', 'batch-good'],
      appointments: [{ id: 'batch-good', client: 'dados não confiáveis' }],
    },
  });

  assert.equal(response.status, 200);
  assert.equal(body.syncedCount, 1);
  assert.equal(body.failed.length, 1);
  assert.equal(body.failed[0].appointmentId, 'batch-broken');
  assert.equal(googleEvents.has(eventIdFor('batch-good')), true);
  assert.equal(googleEvents.has(eventIdFor('batch-broken')), false);
  assert.deepEqual(browserRequests, []);
});

test('o cliente web envia somente identificadores no lote e não recebe credenciais Google', async () => {
  appointments = [appointment({ id: 'browser-batch-1' }), appointment({ id: 'browser-batch-2' })];

  const result = await browserApi.googleCalendar.syncAppointments(['browser-batch-1', 'browser-batch-2']);

  assert.equal(browserRequests.length, 1);
  assert.deepEqual(Object.keys(browserRequests[0].body), ['appointmentIds']);
  assert.deepEqual(browserRequests[0].body.appointmentIds, ['browser-batch-1', 'browser-batch-2']);
  assert.deepEqual(Object.keys(result).sort(), ['failed', 'syncedCount']);
  assert.equal(JSON.stringify(result).toLowerCase().includes('token'), false);
  assert.equal(result.syncedCount, 2);
});