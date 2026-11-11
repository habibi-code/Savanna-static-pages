import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// One sentence from the schedule example in tests/lesson-content.html.
export const source = 'Check both time zones.';
const maxEstimate = 1; // ETB per clip for this proof of concept
export class UserMessage extends Error {}

async function readCached(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function checkAmharic(text) {
  if (typeof text !== 'string' || !/\p{Script=Ethiopic}/u.test(text) || text.length > 240) {
    throw new UserMessage('Expected one short Amharic translation. Check the translation before requesting speech.');
  }
  return text.trim();
}

export async function run(command, { client, directory, confirm, log = console.log }) {
  if (!['translate', 'estimate', 'speak'].includes(command)) throw new UserMessage('Choose translate, estimate, or speak.');
  await mkdir(directory, { recursive: true });
  const translationFile = join(directory, 'translation.txt');
  // Serialize local runs so two terminals cannot both pay for the same translation.
  const lock = join(directory, '.running');
  await writeFile(lock, '', { flag: 'wx' });
  try {
    const cached = await readCached(translationFile);
    if (command === 'translate') {
      if (cached !== null) return log('Cached Amharic:', checkAmharic(cached));
      log('English:', source);
      if (!await confirm('TRANSLATE')) return log('Translation cancelled.');
      const result = await client.translate.create({ text: source, from: 'en', to: 'am' });
      const text = checkAmharic(result.text);
      await writeFile(translationFile, text, 'utf8');
      return log('Amharic:', text);
    }

    if (cached === null) throw new UserMessage('Run the translation test first to obtain the Amharic sentence.');
    const text = checkAmharic(cached);
    const catalog = await client.voices.list({ language: 'am' });
    const available = catalog.filter(voice => voice.language === 'am' && voice.isAvailable === true);
    const voice = available.find(voice => voice.id === 'am-hamen') ?? available[0];
    if (!voice) throw new UserMessage('The catalog currently has no available Amharic voice.');
    const input = { text, voiceId: voice.id, language: 'am', outputFormat: 'mp3_44100' };
    const requestId = createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 32);
    const audioPath = join(directory, requestId + '.mp3');
    if (command === 'speak' && existsSync(audioPath)) return log('Saved clip:', audioPath);
    const quote = await client.voice.estimate(input);
    if (quote.currency !== 'ETB' || !Number.isFinite(quote.estimatedCost) || quote.estimatedCost < 0 ||
        !Number.isFinite(quote.currentBalance)) throw new UserMessage('The estimate is incomplete. Request a fresh quote.');
    log('Voice:', voice.id, '| Amharic:', text);
    log('Estimated billable seconds:', quote.estimatedBillableSeconds, '| Estimated ETB:', quote.estimatedCost,
      '| Balance ETB:', quote.currentBalance);
    if (quote.canGenerate !== true || quote.currentBalance < quote.estimatedCost) {
      throw new UserMessage('The wallet or provider does not permit this generation. Check the balance.');
    }
    if (quote.estimatedCost > maxEstimate) throw new UserMessage('Estimate exceeds the 1 ETB test limit.');
    if (command === 'estimate') return;
    if (!await confirm('GENERATE')) return log('Audio generation cancelled.');
    const clip = await client.voice.generate({ ...input, clientRequestId: requestId });
    log('Clip ID:', clip.id, '| Actual ETB:', clip.usage?.creditsUsed ?? 'unreported');
    const temporary = audioPath + '.' + randomUUID() + '.part';
    await clip.toFile(temporary);
    await rename(temporary, audioPath);
    log('Saved clip:', audioPath);
  } finally {
    await unlink(lock);
  }
}

export function explain(error) {
  if (error instanceof UserMessage) return error.message;
  if (error.code === 'EEXIST') return 'Another run holds output/.running. If a process stopped unexpectedly, verify its account activity before removing the stale lock.';
  if (error.status === 402) return 'Insufficient Addis AI credit. Check the wallet before another request.';
  if ([401, 403].includes(error.status)) return 'Addis AI rejected access. Check ADDIS_API_KEY and its permissions.';
  if (error.status === 429) return 'Addis AI rate limit reached. Try later.';
  return 'Request or file operation failed' + (Number.isInteger(error.status) ? ' (HTTP ' + error.status + ')' : '') +
    '. No automatic retry. Check account activity before repeating a paid operation.';
}
