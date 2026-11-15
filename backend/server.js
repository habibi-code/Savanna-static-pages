import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeServer } from './app.js';
import { deploymentConfig } from './config/deployment.js';
import { createClient } from './shared/addis.js';

export { makeServer };

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT || 3000);
  const server = makeServer(process.env.ADDIS_API_KEY?.trim() ? createClient() : null, undefined, undefined, deploymentConfig());
  server.on('error', () => { console.error('Could not start the translation server. Check PORT.'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', async () => {
    console.log('Savanna is available at http://127.0.0.1:' + server.address().port);
    if (process.env.INKLU_TELEGRAM_ENABLED !== 'true') return;
    const controller = new AbortController();
    server.once('close', () => controller.abort());
    try {
      const { poll, telegramClient } = await import('./modules/telegram/poll.js');
      await poll(telegramClient(process.env.INKLU_TELEGRAM_BOT_TOKEN), controller.signal);
    } catch {
      console.error('Telegram polling stopped. Check the replacement token and single-poller configuration.');
    }
  });
}
