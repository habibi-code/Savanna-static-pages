import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsonPath = resolve(__dirname, 'jobs-data.json');

let cachedJobs = null;
export async function getJobsData() {
  if (cachedJobs) return cachedJobs;
  try {
    const raw = await readFile(jsonPath, 'utf8');
    cachedJobs = JSON.parse(raw);
    return cachedJobs;
  } catch {
    return [];
  }
}

export default getJobsData;
