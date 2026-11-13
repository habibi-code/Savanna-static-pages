import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { makeServer } from './server.js';
import { cachedAudio } from './speech.js';

const text = 'ሁለቱንም የሰዓት ሰቆች ያረጋግጡ።';
async function cache(t) {
  const directory = await mkdtemp(join(tmpdir(), 'inklu-voice-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function seed(directory, voiceId = 'am-hamen', bytes = 'mock clip') {
  // Original CLI / web cache key, independent of the lookup implementation.
  const input = { text, voiceId, language: 'am', outputFormat: 'mp3_44100' };
  const id = createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 32);
  await writeFile(join(directory, id + '.mp3'), bytes);
}

async function listenServer(t, directory, keyless = false, provider, allowance = 0) {
  const calls = [];
  const client = new Proxy({}, { get(_, property) { calls.push(property); throw new Error('Unexpected provider access'); } });
  const server = makeServer(keyless ? null : provider ?? client, directory, allowance);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    assert.deepEqual(calls, []);
  });
  return (body, route = 'listen', headers = {}) => fetch('http://127.0.0.1:' + server.address().port + '/api/speech/' + route,
    { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

function mockVoice() {
  const state = { estimate: 0.5, actual: 0.6, calls: [], voiceId: 'am-hamen', balance: 10 };
  const provider = {
    voices: { list: async () => [{ id: state.voiceId, language: 'am', isAvailable: true }] },
    voice: {
      estimate: async () => ({ estimatedCost: state.estimate, currency: 'ETB', currentBalance: state.balance, canGenerate: true }),
      generate: async input => {
        state.calls.push(input.clientRequestId);
        await state.wait;
        if (state.error) throw state.error;
        return { id: 'clip', usage: { currency: 'ETB', creditsUsed: state.actual }, toFile: path => writeFile(path, 'generated') };
      },
      clips: { list: async () => ({ data: state.history ?? [] }) },
    },
  };
  return { state, provider };
}

test('duplicate clicks share a generation; actual charges survive restart and cached audio stays available', async t => {
  const directory = await cache(t);
  const { state, provider } = mockVoice();
  state.voiceId = 'am-other';
  state.actual = 1.2;
  const post = await listenServer(t, directory, false, provider, 1);
  const responses = await Promise.all([post({ text }), post({ text })]);
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'generated');
  }
  const restarted = await listenServer(t, directory, false, provider, 1);
  assert.equal((await restarted({ text })).status, 200);
  assert.equal((await restarted({ text: text + 'ሀ' })).status, 503);
  assert.equal(state.calls.length, 1);
});

test('per-clip limit, wallet and remaining allowance are checked before dispatch; rejected generation is retryable', async t => {
  const { state, provider } = mockVoice();
  const post = await listenServer(t, await cache(t), false, provider, 0.75);
  for (const [estimate, balance] of [[0.8, 10], [1.01, 10], [0.5, 0]]) {
    Object.assign(state, { estimate, balance });
    assert.equal((await post({ text })).status, 503);
  }
  assert.equal(state.calls.length, 0);
  Object.assign(state, { estimate: 0.5, balance: 2, error: { status: 429 } });
  const failure = await post({ text });
  assert.equal(failure.status, 503);
  assert.doesNotMatch(await failure.text(), /ETB|price|credit|quote/i);
  state.error = null;
  assert.equal((await post({ text })).status, 200);
  assert.equal(state.calls.length, 2);
  assert.equal(state.calls[0], state.calls[1]);
});

test('ambiguous failures keep their reservation; manual retry recovers the clip without a second charge', async t => {
  const directory = await cache(t);
  const { state, provider } = mockVoice();
  state.error = new Error('timeout');
  const post = await listenServer(t, directory, false, provider, 0.5);
  assert.equal((await post({ text })).status, 503);
  const restarted = await listenServer(t, directory, false, provider, 0.5);
  assert.equal((await restarted({ text: text + 'ሀ' })).status, 503);
  assert.equal((await restarted({ text })).status, 503);
  state.history = [{ id: 'recovered', clientRequestId: state.calls[0], toFile: path => writeFile(path, 'recovered') }];
  assert.equal(await (await restarted({ text })).text(), 'recovered');
  assert.equal(state.calls.length, 1);
});

test('existing clips play across server instances, including without an API key', async t => {
  const directory = await cache(t);
  await seed(directory);
  for (const keyless of [true, false]) {
    const post = await listenServer(t, directory, keyless);
    const res = await post({ text });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/mpeg');
    assert.equal(await res.text(), 'mock clip');
    assert.equal((await post({ text: text + 'ሀ' })).status, 503);
  }
});

test('alternate cached voices are readable without catalog access; partial and empty clips are not served', async t => {
  const directory = await cache(t);
  await seed(directory, 'am-hamen', '');
  await writeFile(join(directory, 'unfinished.part'), 'audio');
  assert.equal(await cachedAudio(text, directory), null);
  await seed(directory, 'am-other');
  assert.equal((await cachedAudio(text, directory, 'am-other')).toString(), 'mock clip');
});

test('concurrent misses and retired estimate/generation routes cannot authorize spending', async t => {
  const post = await listenServer(t, await cache(t));
  const responses = await Promise.all([post({ text }), post({ text }), post({ text }, 'estimate'),
    post({ quoteId: 'legacy-token', confirmed: true }, 'generate')]);
  assert.deepEqual(responses.map(r => r.status), [503, 503, 404, 404]);
  for (const r of responses) {
    assert.doesNotMatch(await r.text(), /quote|ETB|price|credit|token/i);
  }
});

test('listen enforces origin, JSON, text limits and rate limiting', async t => {
  const post = await listenServer(t, await cache(t));
  assert.equal((await post({ text }, 'listen', { Origin: 'https://example.invalid' })).status, 403);
  for (const [body, status] of [[{ text: 'English' }, 400], [{ text, confirmed: true }, 400],
    [{ text: 'a።' }, 400], [{ text: 'ሀ'.repeat(241) }, 413], [{ text: 'ሀ'.repeat(2000) }, 413]]) {
    assert.equal((await post(body)).status, status);
  }
  assert.equal((await post({ text }, 'listen', { 'Content-Type': 'text/plain' })).status, 415);
  for (let i = 0; i < 2; i++) assert.equal((await post({ text })).status, 503);
  const limited = await post({ text });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});
