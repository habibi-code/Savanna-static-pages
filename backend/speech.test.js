import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { APIConnectionTimeoutError } from 'addisai';
import { makeServer } from './server.js';

const text = 'ሁለቱንም የሰዓት ሰቆች ያረጋግጡ።';
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'inklu-voice-test-'));
  const state = { price: 0.5, balance: 10, voices: [{ id: 'am-hamen', language: 'am', isAvailable: true }],
    generations: [], estimates: [], error: null };
  const client = {
    voices: { list: async () => state.voices },
    voice: {
      async estimate(input) {
        state.estimates.push(input);
        return { currency: 'ETB', estimatedCost: state.price, canGenerate: true, currentBalance: state.balance };
      },
      async generate(input) {
        state.generations.push(input);
        await state.wait;
        if (state.error) throw state.error;
        return { toFile: path => writeFile(path, 'mock clip') };
      },
    },
  };
  const server = makeServer(client, directory);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const post = (route, body) => fetch('http://127.0.0.1:' + server.address().port + '/api/speech/' + route,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { state, post, offer: async () => (await post('estimate', { text })).json(),
    generate: quoteId => post('generate', { quoteId, confirmed: true }), server };
}

test('only explicit confirmation can redeem the bound passage, voice and price', async t => {
  const { state, post, offer, generate } = await setup(t);
  const { quoteId, voice, estimatedCost } = await offer();
  assert.deepEqual([voice, estimatedCost], ['am-hamen', 0.5]);
  assert.equal((await post('generate', { quoteId, confirmed: false })).status, 400);
  assert.equal((await post('generate', { quoteId, text: 'changed', confirmed: true })).status, 400);
  assert.equal(state.generations.length, 0);
  const response = await generate(quoteId);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal(await response.text(), 'mock clip');
  assert.equal((await generate(quoteId)).status, 409);
  assert.equal(await (await post('estimate', { text })).text(), 'mock clip');
  assert.equal(state.estimates.length, 2);
  assert.equal(state.generations.length, 1);
  const { clientRequestId, ...input } = state.generations[0];
  assert.match(clientRequestId, /^[a-f0-9]{32}$/);
  assert.deepEqual(input, { text, voiceId: voice, language: 'am', outputFormat: 'mp3_44100' });
});

test('two concurrently confirmed quotes for one clip share one generation', async t => {
  const { state, offer, generate, server } = await setup(t);
  const quotes = await Promise.all([offer(), offer()]);
  const gate = Promise.withResolvers();
  state.wait = gate.promise;
  let received = 0;
  server.on('request', req => req.on('end', () => {
    if (++received === 2) setImmediate(gate.resolve);
  }));
  const responses = await Promise.all(quotes.map(q => generate(q.quoteId)));
  assert.deepEqual(await Promise.all(responses.map(r => r.text())), ['mock clip', 'mock clip']);
  assert.equal(state.generations.length, 1);
});

for (const [scenario, change, expected] of [
  ['price increased', s => { s.price = 0.6; }, 409],
  ['over 1 ETB', s => { s.price = 1.01; }, 422],
  ['balance dropped', s => { s.balance = 0; }, 402],
  ['malformed quote', s => { s.price = null; }, 502],
]) {
  test('rechecks before generation when ' + scenario, async t => {
    const { state, offer, generate } = await setup(t);
    const quote = await offer();
    change(state);
    assert.equal((await generate(quote.quoteId)).status, expected);
    assert.equal(state.generations.length, 0);
  });
}

test('expired and unknown quotes cannot generate', async t => {
  const { state, offer, generate } = await setup(t);
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const { quoteId } = await offer();
  t.mock.timers.tick(120001);
  assert.equal((await generate(quoteId)).status, 409);
  assert.equal((await generate('10000000-0000-4000-8000-000000000000')).status, 409);
  assert.equal(state.generations.length, 0);
});

test('input, voice availability, the initial estimate and rate limits are enforced', async t => {
  const { state, post } = await setup(t);
  for (const [input, status] of [['English', 400], ['a።', 400], ['ሀ'.repeat(241), 413], ['ሀ'.repeat(2000), 413]]) {
    assert.equal((await post('estimate', { text: input })).status, status);
  }
  state.price = 1.01;
  assert.equal((await post('estimate', { text })).status, 422);
  state.voices = [];
  assert.equal((await post('estimate', { text })).status, 503);
  for (let i = 0; i < 4; i++) assert.equal((await post('generate', {})).status, 400);
  assert.equal((await post('generate', {})).status, 429);
  assert.equal(state.generations.length, 0);
});

test('generation errors are sanitized and an explicitly approved retry uses the same ID', async t => {
  const { state, offer, generate } = await setup(t);
  state.error = new APIConnectionTimeoutError('private error details');
  let res = await generate((await offer()).quoteId);
  assert.equal(res.status, 504);
  assert.doesNotMatch(await res.text(), /private/);
  state.error = { status: 402 };
  res = await generate((await offer()).quoteId);
  assert.equal(res.status, 402);
  assert.equal(state.generations[0].clientRequestId, state.generations[1].clientRequestId);
});
