import AddisAI from 'addisai';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { run, explain, UserMessage } from './poc.js';

async function confirm(action) {
  if (!process.stdin.isTTY) return false;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await prompt.question('Type ' + action + ' to approve this paid request: ')) === action;
  } finally {
    prompt.close();
  }
}

try {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log('Commands: translate, estimate, speak. Run npm test for the offline checks.');
  } else {
    if (args.length !== 1 || !['translate', 'estimate', 'speak'].includes(args[0])) {
      throw new UserMessage('Use one command: translate, estimate, or speak.');
    }
    if (!process.env.ADDIS_API_KEY?.trim()) throw new UserMessage('Set ADDIS_API_KEY in backend/.env for live tests.');
    const client = new AddisAI({ apiKey: process.env.ADDIS_API_KEY, maxRetries: 0, logLevel: 'off' });
    await run(args[0], { client, confirm, directory: fileURLToPath(new URL('./output/', import.meta.url)) });
  }
} catch (error) {
  console.error(explain(error));
  process.exitCode = 1;
}
