import { createHash } from 'node:crypto';
import { APIConnectionError, APIConnectionTimeoutError } from 'addisai';
import { translateEnglish, UserMessage } from '../../translation.js';
import { automaticSpeech } from '../../automatic-speech.js';
import { explainSimply } from '../../simplify.js';
import { describeImage, loadLessonImage } from '../../visuals.js';
import { cachedResult } from '../../shared/cache.js';
import { readJson, readText, HttpError, json } from '../../middleware/http.js';

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

export const learningPaths = ['/api/translate', '/api/simplify', '/api/describe', '/api/speech/listen'];

export function learningRoutes(client, directory, allowance, deployment) {
  const translate = cachedResult(text => translateEnglish(client, text), logTranslationFailure);
  const simplify = cachedResult(text => explainSimply(client, text));
  const describe = cachedResult((_key, bytes, context) => describeImage(client, bytes, context));
  const speech = automaticSpeech(client, directory, allowance, process.env.INKLU_CACHED_VOICES);
  return async (req, res, path) => {
    const isSpeech = path === '/api/speech/listen';
    try {
      const body = await readJson(req, isSpeech ? 2048 : path === '/api/describe' ? 8192 : 64 * 1024);
      if (path === '/api/describe') {
        if (!body || typeof body.asset !== 'string' || Object.keys(body).length !== 2) throw new HttpError(400, 'Select a lesson image.');
        const context = readText({ text: body.context }, 1200);
        const bytes = await loadLessonImage(body.asset, deployment.imageDirectory);
        if (!bytes) throw new HttpError(400, 'Select a supported lesson image.');
        if (!client) throw new HttpError(503, 'Service is not configured.');
        const key = createHash('sha256').update(bytes).digest('hex') + ':' + context;
        const description = await describe(key, bytes, context);
        if (!res.destroyed) json(res, 200, { description });
        return;
      }
      const text = readText(body, isSpeech ? 240 : 16000);
      if (isSpeech) {
        if (!/[\p{Script=Ethiopic}&&\p{Letter}]/v.test(text)) throw new HttpError(400, 'Select an Amharic passage.');
        const audio = await speech(text);
        if (!res.destroyed) res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' }).end(audio);
        return;
      }
      if (!client) throw new HttpError(503, 'Service is not configured.');
      if (path === '/api/simplify') {
        const explanation = await simplify(text);
        if (!res.destroyed) json(res, 200, { explanation });
        return;
      }
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
      if (path === '/api/describe') {
        const status = error instanceof APIConnectionTimeoutError ? 504 : error.status === 429 ? 429 : 502;
        return json(res, status, { error: 'Image description could not be prepared. Try again.' });
      }
      if (path === '/api/simplify') {
        const status = error instanceof APIConnectionTimeoutError ? 504 : error.status === 429 ? 429 : 502;
        return json(res, status, { error: 'The explanation could not be prepared. Try again.' });
      }
      if (error instanceof APIConnectionTimeoutError) return json(res, 504, { error: 'Translation timed out.' });
      if (error.status === 429) return json(res, 429, { error: 'Translation service is busy. Try again later.' });
      if (error.status === 402) return json(res, 503, { error: 'Translation credit is unavailable.' });
      json(res, 502, { error: 'Translation service is unavailable.' });
    }
  };
}
