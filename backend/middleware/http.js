export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function readJson(req, byteLimit) {
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

export function readText(body, maxLength) {
  if (typeof body?.text !== 'string' || Object.keys(body).length !== 1 ||
      !body.text.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(body.text) ||
      !body.text.isWellFormed()) throw new HttpError(400, 'Provide a plain text lesson in the text field.');
  if (body.text.length > maxLength) throw new HttpError(413, 'Text exceeds the request size limit.');
  return body.text.replace(/\r\n?/g, '\n').trim();
}

export function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
