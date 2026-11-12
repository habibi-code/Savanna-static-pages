import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import test from 'node:test';
import AddisAI, { APIConnectionTimeoutError } from 'addisai';
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

test('a long lesson runs in order, stops on failure and reuses successes on manual retry', async t => {
  const paragraphs = Array.from({ length: 5 }, (_, i) =>
    'Step ' + (i + 1) + '. ' + 'Compare the two calendars before sending an invitation. '.repeat(25).trimEnd());
  const lesson = paragraphs.join('\n\n');
  assert.ok(lesson.length > 7000);
  let active = 0;
  let fail = true;
  const { post, calls } = await start(t, async ({ text }) => {
    assert.equal(++active, 1);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    if (fail && text === paragraphs[2]) throw new Error('private details');
    return { text: 'ክፍል ' + (paragraphs.indexOf(text) + 1) };
  });
  assert.equal((await post(lesson)).status, 502);
  assert.deepEqual(calls.map(call => call.text), paragraphs.slice(0, 3));
  fail = false;
  assert.deepEqual(await (await post(lesson)).json(), { translation: 'ክፍል 1\n\nክፍል 2\n\nክፍል 3\n\nክፍል 4\n\nክፍል 5' });
  assert.deepEqual(calls.map(call => call.text), [...paragraphs.slice(0, 3), ...paragraphs.slice(2)]);
});

test('splits at paragraph, sentence, then word boundaries and restores the exact separators', async t => {
  const { post, calls } = await start(t, async ({ text }) => ({ text: 'አ' + text }));
  const opening = 'Check both time zones. '.repeat(50).trimEnd();
  const next = 'Read the next invitation carefully. '.repeat(14).trimEnd();
  for (const [left, gap, right] of [
    [opening, '\n\n  ', next],
    [opening + ' Ready?”', '  ', 'Review the proposed meeting time '.repeat(16).trimEnd()],
    ['a'.repeat(1497), '\t', 'last'],
    ['x'.repeat(1499), '', '😀end'],
    ['x'.repeat(1500), '', 'end'],
  ]) {
    const before = calls.length;
    const response = await post(left + gap + right);
    assert.deepEqual(await response.json(), { translation: 'አ' + left + gap + 'አ' + right });
    assert.deepEqual(calls.slice(before).map(call => call.text), [left, right]);
  }
});

test('failed second section logs only safe metadata and preserves the public 502', async t => {
  const warnings = t.mock.method(console, 'warn', () => {});
  const marker = 'private-test-marker';
  const sdk = new AddisAI({ apiKey: marker, maxRetries: 0, logLevel: 'off', fetch: async (_url, options) => {
    const { text } = JSON.parse(options.body);
    if (!text.includes(marker)) return Response.json({ data: { translation: amharic } });
    return Response.json({ error: { code: 'translation_incomplete', message: marker, details: [marker] } },
      { status: 502, headers: { 'x-private': marker } });
  } });
  const { post, calls } = await start(t, (input, options) => sdk.translate.create(input, options));
  const second = marker + '😀';
  const response = await post('a'.repeat(1500) + '\n' + second);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'Translation service is unavailable.' });
  assert.equal(calls.length, 2);
  assert.equal(warnings.mock.callCount(), 1);
  const args = warnings.mock.calls[0].arguments;
  assert.equal(args.length, 1);
  const { elapsedMs, ...record } = JSON.parse(args[0]);
  assert.ok(Number.isInteger(elapsedMs) && elapsedMs >= 0);
  assert.deepEqual(record, { event: 'translation_section_failed', sectionIndex: 2, sectionCount: 2,
    characterCount: [...second].length, utf16Units: second.length,
    errorType: 'provider_http_error', providerStatus: 502, providerCode: 'translation_incomplete' });
  assert.ok(!args[0].includes(marker));
});

test('diagnostics distinguish provider size rejection, invalid output, transport failure and SDK timeout', async t => {
  const warnings = t.mock.method(console, 'warn', () => {});
  const sdkResponses = [
    () => Response.json({ error: { code: 'text_too_long' } }, { status: 413 }),
    () => Response.json({ data: { translation: '' } }),
    () => { throw new Error('private transport details'); },
    () => { throw new DOMException('private timeout details', 'TimeoutError'); },
    () => Response.json({ error: { code: 'private unknown code', message: 'private detail' } }, { status: 500 }),
  ];
  const sdk = new AddisAI({ apiKey: 'offline-only', maxRetries: 0, logLevel: 'off',
    fetch: async () => sdkResponses.shift()() });
  const { post } = await start(t, (input, options) => sdk.translate.create(input, options));
  for (const [http, type, upstream, code] of [[502, 'provider_http_error', 413, 'text_too_long'],
    [502, 'invalid_translation', null, null], [502, 'connection_error', null, null],
    [504, 'sdk_timeout', null, null], [502, 'provider_http_error', 500, null]]) {
    assert.equal((await post('private lesson text')).status, http);
    const logged = warnings.mock.calls.at(-1).arguments[0];
    assert.ok(!logged.includes('private'));
    const event = JSON.parse(logged);
    assert.deepEqual([event.sectionIndex, event.errorType, event.providerStatus, event.providerCode], [1, type, upstream, code]);
  }
  assert.equal(warnings.mock.callCount(), 5);
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
