import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cachedAudio, estimateSpeech, prepareSpeech, saveClip, saveSpeech } from './speech.js';

// Integer millionths of an ETB. Round a reservation up and the allowance down.
const scale = 1_000_000;
const unavailable = () => new Error('Audio generation is temporarily unavailable.');

export function automaticSpeech(client, directory, allowance, cachedVoices) {
  const limit = Math.floor(Number(allowance) * scale);
  const pending = new Map();
  const ledgerPath = join(directory, 'automatic-speech.json');
  const lockPath = ledgerPath + '.lock';

  async function readLedger() {
    let ledger;
    try { ledger = JSON.parse(await readFile(ledgerPath, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return {};
      throw error;
    }
    if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger) ||
        !Object.entries(ledger).every(([key, entry]) => /^[a-f0-9]{64}$/.test(key) &&
          Number.isSafeInteger(entry?.units) && entry.units >= 0 &&
          /^[a-f0-9]{32}$/.test(entry.requestId) && /^am-[a-z0-9-]+$/.test(entry.voice))) throw unavailable();
    return ledger;
  }

  async function generate(text) {
    const existing = await cachedAudio(text, directory, cachedVoices);
    if (existing) return existing;
    const key = createHash('sha256').update(text).digest('hex');
    const saved = (await readLedger())[key];
    if (saved) {
      const alternate = await cachedAudio(text, directory, saved.voice);
      if (alternate) return alternate;
    }
    if (!client || (!saved && !(limit > 0))) throw unavailable();
    // All processes sharing this directory serialize paid work and accounting.
    // A process crash leaves the lock for operator reconciliation.
    await mkdir(directory, { recursive: true });
    await writeFile(lockPath, '', { flag: 'wx' });
    try {
      const ledger = await readLedger();
      const entries = Object.values(ledger);
      const previous = ledger[key];
      const cached = await cachedAudio(text, directory, previous?.voice ?? cachedVoices);
      if (cached) return cached;
      async function persist() {
        const temporary = ledgerPath + '.' + randomUUID() + '.part';
        await writeFile(temporary, JSON.stringify(ledger), { flag: 'wx', flush: true });
        await rename(temporary, ledgerPath);
      }
      const used = entries.reduce((sum, entry) => sum + entry.units, 0);
      if (previous) {
        // After an ambiguous timeout, a manual retry can recover an existing
        // generation by its stable provider ID without placing another order.
        let clip;
        if (previous.clipId) clip = await client.voice.clips.get(previous.clipId, { timeout: 10000 });
        else {
          const page = await client.voice.clips.list({ language: 'am', voiceId: previous.voice, limit: 50 }, { timeout: 10000 });
          clip = page.data.find(item => item.clientRequestId === previous.requestId);
          if (!clip) throw unavailable();
          previous.clipId = clip.id;
        }
        const actual = actualUnits(clip);
        if (actual !== undefined) previous.units = actual;
        await persist();
        await saveClip(clip, join(directory, previous.requestId + '.mp3'));
        return readFile(join(directory, previous.requestId + '.mp3'));
      }
      if (!Number.isSafeInteger(limit) || limit <= used) throw unavailable();
      const speech = await prepareSpeech(client, text, directory);
      const alternate = await cachedAudio(text, directory, speech.input.voiceId);
      if (alternate) return alternate;
      const quote = await estimateSpeech(client, speech);
      const units = Math.ceil(quote.estimatedCost * scale);
      if (units > limit - used) throw unavailable();
      const entry = { units, voice: speech.input.voiceId, requestId: speech.requestId };
      ledger[key] = entry;
      await persist();
      try {
        await saveSpeech(client, speech, async clip => {
          entry.clipId = clip.id;
          entry.units = actualUnits(clip) ?? entry.units;
          await persist();
        });
      } catch (error) {
        // A definitive rejection can be retried. Keep uncertain charges reserved.
        if (!entry.clipId && [400, 401, 402, 403, 404, 422, 429].includes(error.status)) {
          delete ledger[key];
          await persist();
        }
        throw error;
      }
      return readFile(speech.audioPath);
    } finally {
      await unlink(lockPath);
    }
  }

  return text => {
    if (!pending.has(text)) pending.set(text, generate(text).finally(() => pending.delete(text)));
    return pending.get(text);
  };
}

function actualUnits(clip) {
  const actual = clip.usage?.creditsUsed;
  if (clip.usage?.currency === 'ETB' && Number.isFinite(actual) && actual >= 0) return Math.ceil(actual * scale);
}
