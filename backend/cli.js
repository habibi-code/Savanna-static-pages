import { createClient, UserMessage } from './translation.js';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { run, explain } from './poc.js';

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
    const client = createClient();
    await run(args[0], { client, confirm, directory: fileURLToPath(new URL('./output/', import.meta.url)) });
  }
} catch (error) {
  console.error(explain(error));
  process.exitCode = 1;
}
