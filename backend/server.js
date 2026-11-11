import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APIConnectionTimeoutError } from 'addisai';
import { createClient, translateEnglish } from './translation.js';

const maxBytes = 64 * 1024;
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readText(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'Send application/json.');
  }
  const tooLarge = () => new HttpError(413, 'Lesson exceeds the translation size limit.');
  if (Number(req.headers['content-length']) > maxBytes) throw tooLarge();
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > maxBytes) throw tooLarge();
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new HttpError(400, 'Invalid JSON.'); }
  if (typeof body?.text !== 'string' || Object.keys(body).length !== 1 ||
      !body.text.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(body.text) ||
      !body.text.isWellFormed()) throw new HttpError(400, 'Provide a plain text lesson in the text field.');
  if (body.text.length > 16000) throw tooLarge();
  return body.text.replace(/\r\n?/g, '\n').trim();
}

// Keep paragraphs together where possible. A near-limit break also bounds the number of calls.
function* sections(text) {
  while (text.length > 5000) {
    let end = text.lastIndexOf('\n', 5000);
    if (end < 4000) end = text.lastIndexOf(' ', 5000);
    if (end < 4000) end = /[\uD800-\uDBFF]/.test(text[4999]) ? 4999 : 5000;
    yield text.slice(0, end).trimEnd();
    text = text.slice(end).trimStart();
  }
  if (text) yield text;
}

function cachedTranslator(client) {
  const saved = new Map();
  const pending = new Map();
  return async text => {
    if (saved.has(text)) return saved.get(text);
    if (pending.has(text)) return pending.get(text);
    const request = translateEnglish(client, text).then(result => {
      if (saved.size >= 128) saved.delete(saved.keys().next().value);
      saved.set(text, result);
      return result;
    }).finally(() => pending.delete(text));
    pending.set(text, request);
    return request;
  };
}

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.riv': 'application/octet-stream' };

async function servePage(path, res) {
  if (path === '/') path = '/index.html';
  const publicFile = /^\/(?:index\.html|tests\/lesson-content\.html|pages\/[\w-]+\.html|assets\/(?:learning-companion|css|js|img|fonts)\/[^/\\:%?#]+)$/;
  const type = types[extname(path)];
  if (!publicFile.test(path) || !type) throw new HttpError(404, 'Not found.');
  let file;
  try { file = await readFile(new URL('..' + path, import.meta.url)); }
  catch { throw new HttpError(404, 'Not found.'); }
  res.writeHead(200, { 'Content-Type': type }).end(file);
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function makeServer(client) {
  const translate = cachedTranslator(client);
  let requests = 0;
  let resetAt = 0;
  return createServer({ requestTimeout: 15000, headersTimeout: 10000, connectionsCheckingInterval: 1000 }, async (req, res) => {
    try {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      const port = req.socket.localPort;
      const host = req.headers.host;
      const suffix = port === 80 ? '' : ':' + port;
      if (!['localhost' + suffix, '127.0.0.1' + suffix].includes(host)) throw new HttpError(403, 'Host is not allowed.');
      const path = req.url.split('?')[0];
      if (path !== '/api/translate') {
        if (req.method !== 'GET') throw new HttpError(404, 'Not found.');
        return await servePage(path, res);
      }
      if (req.headers.origin !== undefined && req.headers.origin !== 'http://' + host) {
        throw new HttpError(403, 'Use the same local origin for the lesson and API.');
      }
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        throw new HttpError(405, 'Use POST.');
      }
      if (Date.now() >= resetAt) { requests = 0; resetAt = Date.now() + 60000; }
      if (++requests > 8) {
        res.setHeader('Retry-After', Math.ceil((resetAt - Date.now()) / 1000));
        throw new HttpError(429, 'Too many requests. Try again in one minute.');
      }
      const text = await readText(req);
      if (!client) throw new HttpError(503, 'Translation service is not configured.');
      const results = [];
      for (const section of sections(text)) {
        if (res.destroyed) return;
        results.push(await translate(section));
      }
      json(res, 200, { translation: results.join('\n\n') });
    } catch (error) {
      if (res.destroyed) return;
      if (error instanceof HttpError) return json(res, error.status, { error: error.message });
      if (error instanceof APIConnectionTimeoutError) return json(res, 504, { error: 'Translation timed out.' });
      if (error.status === 429) return json(res, 429, { error: 'Translation service is busy. Try again later.' });
      if (error.status === 402) return json(res, 503, { error: 'Translation credit is unavailable.' });
      json(res, 502, { error: 'Translation service is unavailable.' });
    }
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT || 3000);
  const server = makeServer(process.env.ADDIS_API_KEY?.trim() ? createClient() : null);
  server.on('error', () => { console.error('Could not start the translation server. Check PORT.'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log('Savanna is available at http://127.0.0.1:' + server.address().port));
}
