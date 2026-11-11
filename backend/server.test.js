import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import test from 'node:test';
import { APIConnectionTimeoutError } from 'addisai';
import { makeServer } from './server.js';

const amharic = 'ሁለቱንም የሰዓት ሰቆች ያረጋግጡ።';
async function start(t, handler = async () => ({ text: amharic })) {
  const calls = [];
  const client = { translate: { async create(input, options) {
    calls.push(input);
    assert.equal(options.timeout, 20000);
    return handler(input);
  } } };
  const server = makeServer(client);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const url = base + '/api/translate';
  const post = (text, headers) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ text }) });
  return { base, url, post, calls, server };
}

test('concurrent identical lessons share a translation and later requests reuse the result', async t => {
  const pending = Promise.withResolvers();
  const entered = Promise.withResolvers();
  const { post, calls, server } = await start(t, () => { entered.resolve(); return pending.promise; });
  const first = post('Check both time zones.');
  await entered.promise;
  const secondRead = new Promise(resolve => server.once('request', req => req.once('end', resolve)));
  const second = post('Check both time zones.');
  await secondRead;
  pending.resolve({ text: amharic });
  const requests = [first, second];
  for (const res of await Promise.all(requests)) assert.deepEqual(await res.json(), { translation: amharic });
  await post('  Check both time zones. ');
  assert.deepEqual(calls, [{ text: 'Check both time zones.', from: 'en', to: 'am' }]);
});

test('long lessons preserve order and a retry reuses successful sections', async t => {
  const paragraph = 'a'.repeat(4600);
  let failed = false;
  const { post, calls } = await start(t, async ({ text }) => {
    if (text === 'last' && !failed) { failed = true; throw new Error('private details'); }
    return { text: text === 'last' ? 'ሁለት' : 'አንድ' };
  });
  const fullLesson = paragraph + '\n' + 'b'.repeat(5000) + '\nlast';
  assert.equal((await post(fullLesson)).status, 502);
  assert.deepEqual(await (await post(fullLesson)).json(), { translation: 'አንድ\n\nአንድ\n\nሁለት' });
  assert.deepEqual(calls.map(call => call.text.length), [4600, 5000, 4, 4]);
});

test('invalid input, unsupported media, wrong method and foreign origins never reach Addis', async t => {
  const { post, url, calls } = await start(t);
  for (const text of ['', 17, 'abc\u0000', 'a'.repeat(16001)]) {
    assert.equal((await post(text)).status, typeof text === 'string' && text.length > 16000 ? 413 : 400);
  }
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await post('x', { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post('x', { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await post('x', { Origin: 'null' })).status, 403);
  assert.equal((await fetch(url)).status, 405);
  assert.equal(calls.length, 0);
});

test('chunked uploads are bounded without trusting Content-Length', async t => {
  const { url, calls } = await start(t);
  const req = request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  const received = once(req, 'response');
  req.write('x'.repeat(40000));
  req.end('x'.repeat(40000));
  const [response] = await received;
  response.resume();
  assert.equal(response.statusCode, 413);
  assert.equal(calls.length, 0);
});

test('a ninth request in the local window receives Retry-After', async t => {
  const { post, calls } = await start(t);
  for (let i = 0; i < 8; i++) assert.equal((await post('Lesson ' + i)).status, 200);
  const limited = await post('Another lesson');
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('Retry-After')) > 0);
  assert.equal(calls.length, 8);
});

for (const [cause, code] of [[{ status: 402 }, 503], [{ status: 429 }, 429],
  [new APIConnectionTimeoutError('sensitive'), 504], [new Error('sensitive'), 502]]) {
  test('provider failure yields sanitized HTTP ' + code, async t => {
    const { post } = await start(t, async () => { throw cause; });
    const response = await post('Check both time zones.');
    assert.equal(response.status, code);
    assert.doesNotMatch(await response.text(), /sensitive|stack|ADDIS_API_KEY/);
  });
}

test('only public static paths are served and opening pages makes no provider calls', async t => {
  const { base, calls } = await start(t);
  for (const path of ['/', '/pages/concept-with-navigation.html', '/tests/lesson-content.html',
    '/assets/learning-companion/learning-companion.js']) assert.equal((await fetch(base + path)).status, 200);
  for (const path of ['/backend/.env', '/.git/config', '/backend/output/translation.txt', '/assets/js/%2e%2e%2fbackend%2f.env']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
  assert.equal(calls.length, 0);
});
