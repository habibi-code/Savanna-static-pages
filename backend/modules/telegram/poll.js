import { setTimeout as delay } from 'node:timers/promises';
import { privateMenus } from './menus.js';

export function telegramClient(token) {
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token ?? '')) throw new Error('Configure a replacement Telegram token.');
  return async (method, body, signal) => {
    const response = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(40000)]),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      const error = new Error('Telegram request failed.');
      error.status = data.error_code ?? response.status;
      error.retryAfter = data.parameters?.retry_after;
      throw error;
    }
    return data.result;
  };
}

export async function poll(call, signal) {
  let handle, offset = 0;
  while (!signal.aborted) {
    try {
      if (!handle) handle = privateMenus((await call('getMe', {}, signal)).username);
      const updates = await call('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, signal);
      for (const update of updates) {
        if (update.update_id < offset) continue;
        const reply = handle(update.message);
        if (reply) {
          try { await call('sendMessage', reply, signal); }
          catch (error) {
            // A blocked bot or undeliverable chat must not hold up other users.
            if (![400, 403].includes(error.status)) throw error;
          }
        }
        offset = update.update_id + 1;
      }
    } catch (error) {
      if (signal.aborted) return;
      if ([401, 403, 404, 409].includes(error.status)) throw new Error('Telegram polling unavailable.');
      const seconds = Number.isSafeInteger(error.retryAfter) ? Math.max(1, error.retryAfter) : 5;
      await delay(Math.min(seconds, 86400) * 1000, undefined, { signal }).catch(() => {});
    }
  }
}
