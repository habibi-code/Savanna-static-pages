import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { makeServer } from '../../app.js';

const gatewayKey = 'g'.repeat(32);
async function listen(t, help) {
  const server = makeServer(null, undefined, '0', { help, lessonOrigins: 'https://learn.example' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port + '/api/help/sessions';
  return (suffix = '', options = {}) => fetch(url + suffix, {
    method: suffix ? 'GET' : 'POST', body: suffix ? undefined : '{}', ...options,
    headers: { 'content-type': 'application/json', 'x-inklu-gateway': gatewayKey,
      'x-inklu-subject': 'learner', ...options.headers },
  });
}

test('help refuses missing configuration, unauthenticated identities, foreign origins and client identity', async t => {
  const offline = await listen(t, {});
  assert.equal((await offline()).status, 503);
  const send = await listen(t, { database: join(tmpdir(), 'unused-help.sqlite'), gatewayKey });
  for (const headers of [{'x-inklu-gateway': ''}, {'x-inklu-subject': ''},
    {'x-inklu-subject': 'two,subjects'}, {origin: 'https://learn.example'}]) {
    assert.equal((await send('', {headers})).status, 403);
  }
  assert.equal((await send('', {body:'{"user_id":"other"}'})).status, 400);
  assert.equal((await send('/signals')).status, 404);
});

test('create, deduplicate, reopen the database, and retrieve only the owner’s ticket', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'inklu-ticket-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const database = join(dir, 'tickets.sqlite');
  const help = { database, gatewayKey };
  const send = await listen(t, help);
  const [a, b] = await Promise.all([send(), send()]);
  assert.equal(a.status, 201);
  const ticket = await a.json();
  assert.equal(ticket.status, 'pending');
  assert.deepEqual(await b.json(), ticket);
  const restarted = await listen(t, help);
  assert.deepEqual(await (await restarted()).json(), ticket);
  const path = '/' + ticket.sessionId;
  const owned = await restarted(path);
  assert.equal(owned.status, 200);
  assert.deepEqual(await owned.json(), ticket);
  assert.equal((await restarted(path, {headers:{'x-inklu-subject':'other'}})).status, 404);
  assert.equal((await restarted(path, {headers:{origin:'https://learn.example'}})).status, 403);
  assert.equal((await restarted(path, {headers:{'x-inklu-gateway':''}})).status, 403);
  const db = new DatabaseSync(database);
  try { db.prepare("UPDATE tickets SET status='resolved' WHERE ticket_id=?").run(ticket.sessionId); }
  finally { db.close(); }
  assert.deepEqual(await (await restarted(path)).json(), {...ticket, status:'resolved'});
  assert.notEqual((await (await restarted()).json()).sessionId, ticket.sessionId);
});

test('standalone Node startup serves both hosts and reuses a pre-migration open ticket', {timeout: 15000}, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'inklu-migration-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const database = join(dir, 'old.sqlite');
  const id = 'd32a22d1-578e-4cd2-a57a-30beae38b68b';
  const db = new DatabaseSync(database);
  try {
    db.exec(`CREATE TABLE tickets (ticket_id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE UNIQUE INDEX open_ticket ON tickets(user_id) WHERE status='open';`);
    db.prepare('INSERT INTO tickets(ticket_id,user_id) VALUES (?,?)').run(id, 'owner');
  } finally { db.close(); }
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../server.js', import.meta.url))], {
    env: { PORT: '0', INKLU_HELP_DB: database, INKLU_HELP_GATEWAY_KEY: gatewayKey },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  const closed = once(child, 'close');
  t.after(async () => { child.kill(); await closed; });
  const lines = createInterface({input: child.stdout});
  const [line] = await Promise.race([once(lines, 'line'), closed.then(() => { throw Error('Server exited'); })]);
  const origin = line.match(/http:\/\/127\.0\.0\.1:\d+/)[0];
  for (const page of ['generic-lesson', 'concept-with-navigation']) {
    assert.equal((await fetch(origin + '/pages/' + page + '.html')).status, 200);
  }
  const route = origin + '/api/help/sessions';
  const headers = {'content-type':'application/json', 'x-inklu-gateway':gatewayKey, 'x-inklu-subject':'owner'};
  for (const response of [await fetch(route, {headers, method:'POST', body:'{}'}), await fetch(route + '/' + id, {headers})]) {
    assert.deepEqual(await response.json(), {sessionId:id, status:'pending'});
  }
});
