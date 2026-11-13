import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { UserMessage } from './translation.js';

export class SpeechError extends UserMessage {
  constructor(status, message) { super(message); this.status = status; }
}

// Match the existing on-disk filenames and provider request IDs.
function speechFile(text, voiceId, directory) {
  const input = { text, voiceId, language: 'am', outputFormat: 'mp3_44100' };
  const requestId = createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 32);
  return { input, requestId, audioPath: join(directory, requestId + '.mp3') };
}

export async function cachedAudio(text, directory, alternateVoices = '') {
  const voices = new Set(['am-hamen', ...alternateVoices.split(',').map(id => id.trim())]);
  for (const id of voices) {
    if (!/^am-[a-z0-9-]+$/.test(id)) continue;
    const { audioPath } = speechFile(text, id, directory);
    try {
      const file = await stat(audioPath);
      if (file.isFile() && file.size > 0 && file.size <= 4 * 1024 * 1024) return await readFile(audioPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return null;
}

export async function prepareSpeech(client, text, directory) {
  const catalog = await client.voices.list({ language: 'am' }, { timeout: 10000 });
  const available = catalog.filter(voice => voice.language === 'am' && voice.isAvailable === true &&
    /^am-[a-z0-9-]+$/.test(voice.id));
  const voice = available.find(voice => voice.id === 'am-hamen') ?? available[0];
  if (!voice) throw new SpeechError(503, 'The catalog currently has no available Amharic voice.');
  return speechFile(text, voice.id, directory);
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
  await onGenerated?.(clip);
  return saveClip(clip, audioPath);
}

export async function saveClip(clip, audioPath) {
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
