import { timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.js';

export function authenticatedLearner(headers, gatewayKey) {
  if (!gatewayKey || !/^[A-Za-z0-9_-]{32,128}$/.test(gatewayKey)) {
    throw new HttpError(503, 'Human Help is unavailable for this session.');
  }
  const expected = Buffer.from(gatewayKey);
  const supplied = Buffer.from(headers['x-inklu-gateway'] ?? '');
  const subject = headers['x-inklu-subject'];
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(subject ?? '')) {
    throw new HttpError(403, 'Human Help is unavailable for this session.');
  }
  return subject;
}
