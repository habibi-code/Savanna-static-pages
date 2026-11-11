import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkAmharic, translateEnglish, UserMessage } from './translation.js';
import { prepareSpeech, estimateSpeech, saveSpeech } from './speech.js';
export { UserMessage };

// One sentence from the schedule example in tests/lesson-content.html.
export const source = 'Check both time zones.';

async function readCached(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
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
      if (cached !== null) return log('Cached Amharic:', checkAmharic(cached, 240));
      log('English:', source);
      if (!await confirm('TRANSLATE')) return log('Translation cancelled.');
      const text = await translateEnglish(client, source, 240);
      await writeFile(translationFile, text, 'utf8');
      return log('Amharic:', text);
    }

    if (cached === null) throw new UserMessage('Run the translation test first to obtain the Amharic sentence.');
    const text = checkAmharic(cached, 240);
    const speech = await prepareSpeech(client, text, directory);
    if (command === 'speak' && existsSync(speech.audioPath)) return log('Saved clip:', speech.audioPath);
    await estimateSpeech(client, speech, quote => {
      log('Voice:', speech.input.voiceId, '| Amharic:', text);
      log('Estimated billable seconds:', quote.estimatedBillableSeconds, '| Estimated ETB:', quote.estimatedCost,
        '| Balance ETB:', quote.currentBalance);
    });
    if (command === 'estimate') return;
    if (!await confirm('GENERATE')) return log('Audio generation cancelled.');
    await saveSpeech(client, speech, clip => log('Clip ID:', clip.id, '| Actual ETB:', clip.usage?.creditsUsed ?? 'unreported'));
    log('Saved clip:', speech.audioPath);
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
