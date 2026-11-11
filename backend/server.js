import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { APIConnectionTimeoutError } from 'addisai';
import { createClient, translateEnglish } from './translation.js';
import { SpeechError, speechService } from './speech.js';

const maxBytes = 64 * 1024;
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readJson(req, byteLimit) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'Send application/json.');
  }
  const tooLarge = () => new HttpError(413, 'Request body is too large.');
  if (Number(req.headers['content-length']) > byteLimit) throw tooLarge();
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > byteLimit) throw tooLarge();
    chunks.push(chunk);
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new HttpError(400, 'Invalid JSON.'); }
}

function readText(body, maxLength) {
  if (typeof body?.text !== 'string' || Object.keys(body).length !== 1 ||
      !body.text.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(body.text) ||
      !body.text.isWellFormed()) throw new HttpError(400, 'Provide a plain text lesson in the text field.');
  if (body.text.length > maxLength) throw new HttpError(413, 'Text exceeds the request size limit.');
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

export function makeServer(client, directory = fileURLToPath(new URL('./output/', import.meta.url))) {
  const translate = cachedTranslator(client);
  const speech = speechService(client, directory);
  const limits = new Map([['/api/translate', 8], ['/api/speech/estimate', 8], ['/api/speech/generate', 4]]);
  const windows = new Map();
  return createServer({ requestTimeout: 15000, headersTimeout: 10000, connectionsCheckingInterval: 1000 }, async (req, res) => {
    const path = req.url.split('?')[0];
    const isSpeech = path.startsWith('/api/speech/');
    try {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      const port = req.socket.localPort;
      const host = req.headers.host;
      const suffix = port === 80 ? '' : ':' + port;
      if (!['localhost' + suffix, '127.0.0.1' + suffix].includes(host)) throw new HttpError(403, 'Host is not allowed.');
      if (!limits.has(path)) {
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
      let window = windows.get(path);
      if (!window || window.until <= Date.now()) {
        window = { count: 0, until: Date.now() + 60000 };
        windows.set(path, window);
      }
      if (++window.count > limits.get(path)) {
        res.setHeader('Retry-After', Math.ceil((window.until - Date.now()) / 1000));
        throw new HttpError(429, 'Too many requests. Try again in one minute.');
      }
      const body = await readJson(req, isSpeech ? 2048 : maxBytes);
      const generate = path === '/api/speech/generate';
      const text = generate ? null : readText(body, isSpeech ? 240 : 16000);
      if (!client) throw new HttpError(503, 'Service is not configured.');
      if (isSpeech) {
        let audioPath;
        if (!generate) {
          if (!/[\p{Script=Ethiopic}&&\p{Letter}]/v.test(text)) throw new HttpError(400, 'Select an Amharic passage.');
          const offer = await speech.offer(text);
          if (!offer.audioPath) return json(res, 200, offer);
          audioPath = offer.audioPath;
        } else {
          if (body?.confirmed !== true || typeof body.quoteId !== 'string' ||
              !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(body.quoteId) ||
              Object.keys(body).length !== 2) {
            throw new HttpError(400, 'Confirm the displayed quote before generating audio.');
          }
          audioPath = await speech.redeem(body.quoteId);
        }
        const audio = await readFile(audioPath);
        if (!res.destroyed) res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' }).end(audio);
        return;
      }
      const results = [];
      for (const section of sections(text)) {
        if (res.destroyed) return;
        results.push(await translate(section));
      }
      json(res, 200, { translation: results.join('\n\n') });
    } catch (error) {
      if (res.destroyed) return;
      if (error instanceof HttpError || error instanceof SpeechError) return json(res, error.status, { error: error.message });
      if (isSpeech) {
        let status = 502, message = 'Speech service is unavailable. Request a new estimate to retry.';
        if (error instanceof APIConnectionTimeoutError || error.name === 'TimeoutError') { status = 504; message = 'The speech request timed out.'; }
        else if (error.status === 402) { status = 402; message = 'Insufficient credit for speech generation.'; }
        else if (error.status === 429) { status = 429; message = 'Speech service is busy. Try again later.'; }
        else if ([400, 404, 422].includes(error.status)) { message = 'The service could not use this voice or passage. Request a fresh estimate.'; }
        return json(res, status, { error: message });
      }
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
