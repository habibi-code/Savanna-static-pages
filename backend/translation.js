import { UserMessage } from './shared/addis.js';
export { createClient, UserMessage } from './shared/addis.js';

export function checkAmharic(text, maxLength) {
  if (typeof text !== 'string' || !/\p{Script=Ethiopic}/u.test(text) || text.length > maxLength) {
    throw new UserMessage('The provider did not return usable Amharic text.');
  }
  return text.trim();
}

export async function translateEnglish(client, text, maxOutputLength = 20000) {
  const result = await client.translate.create({ text, from: 'en', to: 'am' }, { timeout: 20000 });
  return checkAmharic(result.text, maxOutputLength);
}
