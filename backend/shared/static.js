import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { HttpError } from '../middleware/http.js';

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.riv': 'application/octet-stream' };

export async function servePage(path, res) {
  if (path === '/') path = '/index.html';
  const publicFile = /^\/(?:index\.html|tests\/lesson-content\.html|pages\/[\w-]+\.html|assets\/(?:learning-companion|css|js|img|fonts)\/[^/\\:%?#]+)$/;
  const type = types[extname(path)];
  if (!publicFile.test(path) || !type) throw new HttpError(404, 'Not found.');
  let file;
  try { file = await readFile(new URL('../..' + path, import.meta.url)); }
  catch { throw new HttpError(404, 'Not found.'); }
  res.writeHead(200, { 'Content-Type': type }).end(file);
}
