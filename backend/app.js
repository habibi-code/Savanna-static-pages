import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { exactOrigin } from './config/deployment.js';
import { rateLimiter } from './middleware/rate-limit.js';
import { HttpError, json } from './middleware/http.js';
import { servePage } from './shared/static.js';
import { learningPaths, learningRoutes } from './modules/learning/routes.js';
import { helpRoute, sessionsPath, ticketPath } from './modules/human-help/routes.js';

export function makeServer(client, directory = fileURLToPath(new URL('./output/', import.meta.url)), allowance = process.env.INKLU_TTS_ALLOWANCE_ETB,
  deployment = {}) {
  const publicOrigin = deployment.publicOrigin ? exactOrigin(deployment.publicOrigin) : null;
  const lessonOrigins = new Set((deployment.lessonOrigins ?? '').split(',').map(value => value.trim())
    .filter(Boolean).map(value => exactOrigin(value).origin));
  const learning = learningRoutes(client, directory, allowance, deployment);
  const checkRate = rateLimiter(8);
  return createServer({ requestTimeout: 15000, headersTimeout: 10000, connectionsCheckingInterval: 1000 }, async (req, res) => {
    const path = req.url.split('?')[0];
    const ticketId = ticketPath.exec(path)?.[1];
    const rateKey = ticketId ? 'ticket lookup' : path;
    const isHelp = Boolean(ticketId) || path === sessionsPath;
    try {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      const port = req.socket.localPort;
      const host = req.headers.host;
      const suffix = port === 80 ? '' : ':' + port;
      const validHost = publicOrigin ? host === publicOrigin.host : ['localhost' + suffix, '127.0.0.1' + suffix].includes(host);
      if (!validHost) throw new HttpError(403, 'Host is not allowed.');
      if (!isHelp && !learningPaths.includes(path)) {
        if (req.method !== 'GET') throw new HttpError(404, 'Not found.');
        return await servePage(path, res);
      }
      const origin = req.headers.origin;
      const crossOrigin = origin !== undefined && origin !== (publicOrigin?.origin ?? 'http://' + host);
      res.setHeader('Vary', 'Origin');
      if (crossOrigin) {
        if (isHelp) throw new HttpError(403, 'Human Help requires the LMS origin.');
        if (!lessonOrigins.has(origin)) throw new HttpError(403, 'Lesson origin is not allowed.');
        res.setHeader('Access-Control-Allow-Origin', origin);
        if (req.method === 'OPTIONS') {
          if (req.headers['access-control-request-method'] !== 'POST' ||
              req.headers['access-control-request-headers']?.toLowerCase().trim() !== 'content-type') {
            throw new HttpError(403, 'Preflight is not allowed.');
          }
          res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' }).end();
          return;
        }
      }
      const method = ticketId ? 'GET' : 'POST';
      if (req.method !== method) {
        res.setHeader('Allow', method);
        throw new HttpError(405, 'Use ' + method + '.');
      }
      checkRate(rateKey, res);
      if (isHelp) return await helpRoute(req, res, deployment.help, ticketId);
      await learning(req, res, path);
    } catch (error) {
      if (!res.destroyed) json(res, error instanceof HttpError ? error.status : 500,
        { error: error instanceof HttpError ? error.message : 'Service unavailable.' });
    }
  });
}
