import { UserMessage } from './shared/addis.js';
export { createClient, UserMessage } from './shared/addis.js';

export const SUPPORTED_TRANSLATION_LANGUAGES = new Set(['en', 'am', 'om', 'ti']);

export function checkTranslationOutput(text, targetLanguage, maxLength = 20000) {
  if (typeof text !== 'string' || !text.trim() || text.length > maxLength) {
    throw new UserMessage('The provider did not return usable translated text.');
  }
  if (targetLanguage === 'am' || targetLanguage === 'ti') {
    if (!/\p{Script=Ethiopic}/u.test(text)) {
      throw new UserMessage(targetLanguage === 'am' ? 'The provider did not return usable Amharic text.' : 'The provider did not return usable Tigrinya text.');
    }
  } else if (!/\p{Letter}/u.test(text)) {
    throw new UserMessage('The provider did not return usable translated text.');
  }
  return text.trim();
}

export function checkAmharic(text, maxLength) {
  return checkTranslationOutput(text, 'am', maxLength);
}

export async function translateText(client, text, from = 'en', to = 'am', maxOutputLength = 20000) {
  const result = await client.translate.create({ text, from, to }, { timeout: 20000 });
  return checkTranslationOutput(result.text, to, maxOutputLength);
}

export async function translateEnglish(client, text, maxOutputLength = 20000) {
  return translateText(client, text, 'en', 'am', maxOutputLength);
}

