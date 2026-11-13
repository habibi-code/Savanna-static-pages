import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { APIConnectionError, APIConnectionTimeoutError } from 'addisai';
import { createClient, translateEnglish, UserMessage } from './translation.js';
import { automaticSpeech } from './automatic-speech.js';

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

const sectionLimit = 1500; // UTF-16 code units, consistent with the request limit.

function* sections(text) {
  while (text.length > sectionLimit) {
    let paragraph, sentence, word;
    for (const gap of text.matchAll(/\s+/gu)) {
      if (gap.index > sectionLimit) break;
      word = gap;
      // Prefer complete blocks and sentences in the last third of the budget.
      if (gap.index < sectionLimit * 2 / 3) continue;
      if (gap[0].includes('\n')) paragraph = gap;
      else if (/[.!?]["'”’»)\]]*$/u.test(text.slice(0, gap.index))) sentence = gap;
    }
    const boundary = paragraph ?? sentence ?? word;
    let end = boundary?.index ?? sectionLimit;
    if (!boundary && /[\uD800-\uDBFF]/u.test(text[end - 1])) end--;
    const separator = boundary?.[0] ?? '';
    yield { text: text.slice(0, end), separator };
    text = text.slice(end + separator.length);
  }
  if (text) yield { text, separator: '' };
}

// Provider messages, headers, response bodies, and even arbitrary error codes may contain text.
// Emit only numeric metadata, our own categories, and documented allowlisted codes.
const translationCodes = new Set(['text_too_long', 'translation_incomplete', 'invalid_input', 'invalid_json']);

function logTranslationFailure(error, text, sectionIndex, sectionCount, started) {
  const status = error?.status;
  const providerStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
  let errorType = 'unexpected_error';
  if (error instanceof APIConnectionTimeoutError) errorType = 'sdk_timeout';
  else if (error instanceof APIConnectionError) errorType = 'connection_error';
  else if (error instanceof UserMessage) errorType = 'invalid_translation';
  else if (providerStatus !== null) errorType = 'provider_http_error';
  console.warn(JSON.stringify({
    event: 'translation_section_failed', sectionIndex, sectionCount,
    characterCount: [...text].length, utf16Units: text.length,
    elapsedMs: Math.round(performance.now() - started), errorType, providerStatus,
    providerCode: translationCodes.has(error?.code) ? error.code : null,
  }));
}

function cachedTranslator(client) {
  const saved = new Map();
  const pending = new Map();
  return async (text, sectionIndex, sectionCount) => {
    if (saved.has(text)) return saved.get(text);
    if (pending.has(text)) return pending.get(text);
    const started = performance.now();
    const request = translateEnglish(client, text).then(result => {
      if (saved.size >= 128) saved.delete(saved.keys().next().value);
      saved.set(text, result);
      return result;
    }, error => {
      logTranslationFailure(error, text, sectionIndex, sectionCount, started);
      throw error;
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

export function makeServer(client, directory = fileURLToPath(new URL('./output/', import.meta.url)), allowance = process.env.INKLU_TTS_ALLOWANCE_ETB) {
  const translate = cachedTranslator(client);
  const speech = automaticSpeech(client, directory, allowance, process.env.INKLU_CACHED_VOICES);
  const limits = new Map([['/api/translate', 8], ['/api/speech/listen', 8]]);
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
      const text = readText(body, isSpeech ? 240 : 16000);
      if (isSpeech) {
        if (!/[\p{Script=Ethiopic}&&\p{Letter}]/v.test(text)) throw new HttpError(400, 'Select an Amharic passage.');
        const audio = await speech(text);
        if (!res.destroyed) res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' }).end(audio);
        return;
      }
      if (!client) throw new HttpError(503, 'Service is not configured.');
      const results = [];
      const parts = [...sections(text)];
      for (const [index, section] of parts.entries()) {
        if (res.destroyed) return;
        results.push(await translate(section.text, index + 1, parts.length), section.separator);
      }
      json(res, 200, { translation: results.join('') });
    } catch (error) {
      if (res.destroyed) return;
      if (error instanceof HttpError) return json(res, error.status, { error: error.message });
      if (isSpeech) return json(res, 503, { error: 'Audio is temporarily unavailable.' });
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
