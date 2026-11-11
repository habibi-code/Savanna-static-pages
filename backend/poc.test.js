import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import AddisAI from 'addisai';
import { explain, run, source } from './poc.js';

// All SDK requests, including clip downloads, go through this in-memory transport.
const translated = 'ሁለቱንም የሰዓት ሰቆች ያረጋግጡ።';
async function setup(t, { quote = {}, voices, status } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'savanna-addis-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = [];
  const client = new AddisAI({ apiKey: 'offline-test', maxRetries: 0, logLevel: 'off',
    fetch: async (url, options) => {
      const path = new URL(url).pathname;
      const body = options?.body ? JSON.parse(options.body) : undefined;
      calls.push({ path, body });
      if (status) return Response.json({ message: 'private provider details' }, { status });
      switch (path) {
        case '/api/v1/translate':
          return Response.json({ data: { translation: translated } });
        case '/api/v1/voice/voices':
          assert.equal(new URL(url).searchParams.get('language'), 'am');
          return Response.json({ data: voices ?? [{ id: 'am-hamen', language: 'am', is_available: true }] });
        case '/api/v1/voice/estimate':
          return Response.json({ data: { estimated_cost: 0.5, estimated_billable_seconds: 6,
            currency: 'ETB', current_balance: 500, can_generate: true, ...quote } });
        case '/api/v1/voice/generations':
          return Response.json({ data: { id: 'test-clip', audio_url: 'https://offline.invalid/sample' } });
        case '/sample':
          return new Response('offline test bytes');
        default:
          throw new Error('Unexpected SDK request');
      }
    },
  });
  return { directory, calls, execute: (command, approved) => run(command, {
    directory, client, confirm: async action => approved === action, log() {},
  }) };
}

test('one fixture translation, one quoted Voices 2 clip, repeat calls use the cache', async t => {
  const { directory, calls, execute } = await setup(t);
  const fixture = await readFile(new URL('../tests/lesson-content.html', import.meta.url), 'utf8');
  assert.ok(fixture.includes('<li>' + source + '</li>'));
  await execute('translate');
  assert.equal(calls.length, 0);
  await execute('translate', 'TRANSLATE');
  await execute('translate', 'TRANSLATE');
  assert.deepEqual(calls.map(call => call.body), [{ text: source, source_language: 'en', target_language: 'am' }]);
  assert.equal(await readFile(join(directory, 'translation.txt'), 'utf8'), translated);
  await execute('estimate');
  await execute('speak');
  assert.ok(!calls.some(call => call.path.endsWith('/generations')));
  await execute('speak', 'GENERATE');
  const [estimate, generation, download] = calls.slice(-3);
  assert.equal(estimate.path, '/api/v1/voice/estimate');
  assert.equal(generation.path, '/api/v1/voice/generations');
  assert.deepEqual(estimate.body, { text: translated, language: 'am', voice_id: 'am-hamen', output_format: 'mp3_44100' });
  assert.deepEqual(generation.body, { ...estimate.body, stream: false, client_request_id: generation.body.client_request_id });
  assert.match(generation.body.client_request_id, /^[a-f0-9]{32}$/);
  assert.equal(download.path, '/sample');
  await execute('speak', 'GENERATE');
  assert.equal(calls.filter(call => call.path.endsWith('/generations')).length, 1);
  const audio = (await readdir(directory)).find(file => file.endsWith('.mp3'));
  assert.equal(await readFile(join(directory, audio), 'utf8'), 'offline test bytes');
});

for (const [name, settings, message] of [
  ['insufficient balance', { quote: { can_generate: false } }, /wallet/],
  ['estimate above budget', { quote: { estimated_cost: 1.01 } }, /limit/],
  ['unusable estimate', { quote: { estimated_cost: null } }, /incomplete/],
  ['no available Amharic voice', { voices: [{ language: 'am', id: 'am-hamen', is_available: false }] }, /catalog/],
]) {
  test(name, async t => {
    const { directory, execute, calls } = await setup(t, settings);
    await writeFile(join(directory, 'translation.txt'), translated);
    await assert.rejects(execute('speak', 'GENERATE'), message);
    assert.ok(!calls.some(call => call.path.endsWith('/generations')));
  });
}

for (const [status, message] of [[401, /permissions/], [402, /credit/], [429, /rate limit/], [503, /HTTP 503/]]) {
  test('HTTP ' + status + ' is reported safely after one attempt', async t => {
    const { execute, calls } = await setup(t, { status });
    await assert.rejects(execute('translate', 'TRANSLATE'), error => {
      assert.match(explain(error), message);
      assert.doesNotMatch(explain(error), /private provider details/);
      return true;
    });
    assert.equal(calls.length, 1);
  });
}
