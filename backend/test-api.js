// Temporary test script to verify online LLM API connectivity
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from './translation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Attempt to load .env from backend/.env or root .env
const candidateEnvFiles = [
  resolve(__dirname, '.env'),
  resolve(__dirname, '..', '.env'),
];

let envLoadedFrom = null;
for (const envPath of candidateEnvFiles) {
  if (existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
      envLoadedFrom = envPath;
      break;
    } catch (err) {
      console.warn(`[Config] Warning: Could not parse ${envPath}: ${err.message}`);
    }
  }
}

console.log('==================================================');
console.log('      Online LLM API Connection Diagnostic');
console.log('==================================================');

if (envLoadedFrom) {
  console.log(`[Config] Environment file found: ${envLoadedFrom}`);
} else {
  console.log('[Config] No .env file found in backend/ or root.');
}

const apiKey = process.env.ADDIS_API_KEY?.trim();

if (!apiKey) {
  console.error('\n[Result: FAILED - Missing Key]');
  console.error('ADDIS_API_KEY is not set in the environment or .env file.');
  console.error('Because ADDIS_API_KEY is missing, server.js and ai-tutor.js pass client = null,');
  console.error('causing the backend to automatically engage local offline fallback mode.\n');
  console.error('To test with a live LLM connection, create a "backend/.env" file containing:');
  console.error('  ADDIS_API_KEY=<your_actual_addis_api_key>\n');
  process.exit(1);
}

const maskedKey = apiKey.length > 8
  ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)} (length: ${apiKey.length})`
  : '*** (short)';
console.log(`[Config] ADDIS_API_KEY detected: ${maskedKey}`);

async function testApi() {
  let client;
  try {
    client = createClient();
    console.log('[Config] AddisAI client initialized successfully.');
  } catch (initErr) {
    console.error(`[Error] Failed to initialize AddisAI client: ${initErr.message}`);
    process.exit(1);
  }

  console.log('[Request] Sending "ping" message via client.chat.completions.create()...');
  const startTime = Date.now();

  try {
    const completion = await client.chat.completions.create(
      {
        system: 'You are a helpful AI assistant. Please reply with "pong" or confirm connectivity.',
        messages: [{ role: 'user', content: 'ping' }],
        temperature: 0.1,
        max_tokens: 50,
      },
      { timeout: 15000 }
    );

    const elapsed = Date.now() - startTime;
    const reply = completion.choices?.[0]?.message?.content?.trim();

    console.log('\n==================================================');
    console.log('           API CONNECTION: SUCCESSFUL!           ');
    console.log('==================================================');
    console.log(`Response time: ${elapsed}ms`);
    console.log(`Model reply:   "${reply}"`);
    console.log('\nThe online LLM is healthy and responding.');
  } catch (apiError) {
    const elapsed = Date.now() - startTime;
    console.error('\n==================================================');
    console.error('            API CONNECTION: FAILED!              ');
    console.error('==================================================');
    console.error(`Duration: ${elapsed}ms`);
    console.error(`Error status:  ${apiError.status || apiError.statusCode || 'N/A'}`);
    console.error(`Error code:    ${apiError.code || 'N/A'}`);
    console.error(`Error message: ${apiError.message}`);

    if (apiError.status === 401 || apiError.status === 403) {
      console.error('\nExplanation: The API key was rejected as unauthorized. Check ADDIS_API_KEY.');
    } else if (apiError.status === 429) {
      console.error('\nExplanation: Rate limit exceeded or quota exhausted.');
    } else if (apiError.code === 'ECONNREFUSED' || apiError.code === 'ENOTFOUND') {
      console.error('\nExplanation: Network error. Unable to reach the provider host.');
    }
    process.exit(1);
  }
}

testApi();
