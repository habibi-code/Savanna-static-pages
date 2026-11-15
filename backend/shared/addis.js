import AddisAI from 'addisai';

export class UserMessage extends Error {}

export function createClient() {
  if (!process.env.ADDIS_API_KEY?.trim()) throw new UserMessage('Set ADDIS_API_KEY in backend/.env for live tests.');
  return new AddisAI({ apiKey: process.env.ADDIS_API_KEY, maxRetries: 0, logLevel: 'off',
    // The SDK passes a signal for API calls. Its signed clip download needs its own deadline.
    fetch: (url, options) => fetch(url, { ...options, signal: options?.signal ?? AbortSignal.timeout(20000) }),
  });
}
