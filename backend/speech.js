import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { UserMessage } from './translation.js';

export class SpeechError extends UserMessage {
  constructor(status, message) { super(message); this.status = status; }
}

export async function prepareSpeech(client, text, directory) {
  const catalog = await client.voices.list({ language: 'am' }, { timeout: 10000 });
  const available = catalog.filter(voice => voice.language === 'am' && voice.isAvailable === true &&
    /^am-[a-z0-9-]+$/.test(voice.id));
  const voice = available.find(voice => voice.id === 'am-hamen') ?? available[0];
  if (!voice) throw new SpeechError(503, 'The catalog currently has no available Amharic voice.');
  const input = { text, voiceId: voice.id, language: 'am', outputFormat: 'mp3_44100' };
  const requestId = createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 32);
  return { input, requestId, audioPath: join(directory, requestId + '.mp3') };
}

export async function estimateSpeech(client, { input }, onEstimate) {
  const quote = await client.voice.estimate(input, { timeout: 10000 });
  if (quote.currency !== 'ETB' || !Number.isFinite(quote.estimatedCost) || quote.estimatedCost < 0 ||
      !Number.isFinite(quote.currentBalance)) throw new SpeechError(502, 'The estimate is incomplete. Request a fresh quote.');
  onEstimate?.(quote);
  if (quote.canGenerate !== true || quote.currentBalance < quote.estimatedCost) {
    throw new SpeechError(402, 'The wallet or provider does not permit this generation. Check the balance.');
  }
  if (quote.estimatedCost > 1) throw new SpeechError(422, `Estimate of ${quote.estimatedCost} ETB exceeds the 1 ETB limit. Choose a shorter passage.`);
  return quote;
}

export async function saveSpeech(client, { input, requestId, audioPath }, onGenerated) {
  await mkdir(dirname(audioPath), { recursive: true });
  const clip = await client.voice.generate({ ...input, clientRequestId: requestId }, { timeout: 95000 });
  onGenerated?.(clip);
  const temporary = audioPath + '.' + randomUUID() + '.part';
  try {
    await clip.toFile(temporary);
    const { size } = await stat(temporary);
    if (!size || size > 4 * 1024 * 1024) throw new SpeechError(502, 'The provider returned an unusable audio clip.');
    await rename(temporary, audioPath);
  } finally {
    await rm(temporary, { force: true });
  }
  return audioPath;
}

// Only the server holds the text, voice and price associated with an approval token.
export function speechService(client, directory) {
  const quotes = new Map();
  const pending = new Map();
  return {
    async offer(text) {
      const speech = await prepareSpeech(client, text, directory);
      if (existsSync(speech.audioPath)) return { audioPath: speech.audioPath };
      const { estimatedCost } = await estimateSpeech(client, speech);
      const quoteId = randomUUID();
      for (const [id, quote] of quotes) if (quote.until <= Date.now()) quotes.delete(id);
      if (quotes.size >= 32) quotes.delete(quotes.keys().next().value);
      quotes.set(quoteId, { speech, estimatedCost, until: Date.now() + 120000 });
      return { quoteId, estimatedCost, currency: 'ETB', voice: speech.input.voiceId };
    },

    async redeem(id) {
      const quote = quotes.get(id);
      quotes.delete(id);
      if (!quote || quote.until <= Date.now()) throw new SpeechError(409, 'Quote expired or already used. Request a fresh estimate.');
      const { speech } = quote;
      if (existsSync(speech.audioPath)) return speech.audioPath;
      if (!pending.has(speech.requestId)) {
        const generate = async () => {
          const fresh = await estimateSpeech(client, speech);
          if (fresh.estimatedCost > quote.estimatedCost) throw new SpeechError(409, 'Price changed. Request a fresh estimate.');
          return saveSpeech(client, speech);
        };
        pending.set(speech.requestId, generate().finally(() => pending.delete(speech.requestId)));
      }
      return pending.get(speech.requestId);
    },
  };
}
