import { readFileSync } from 'node:fs';

// Reviewed sample data from Barok's menus. It contains no live listings.
const catalog = JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url), 'utf8'));
export const languages = new Map(Object.entries(catalog.languages));

export function examples(topic, language) {
  const title = topic === 'jobs' ? 'Sample job roles (no live vacancies)' : 'Sample course topics';
  return [title, ...catalog[topic][language].map(item => '• ' + item)].join('\n');
}
