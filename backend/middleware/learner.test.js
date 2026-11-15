import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authenticatedLearner } from './learner.js';

const gatewayKey = 'g'.repeat(32);
const headers = { 'x-inklu-gateway': gatewayKey, 'x-inklu-subject': 'learner-1' };

test('help intake fails closed with missing or malformed gateway configuration', () => {
  for (const key of [undefined, '', 'short', ' '.repeat(32)]) {
    assert.throws(() => authenticatedLearner(headers, key), { status: 503 });
  }
});

test('help intake requires a gateway credential and an opaque LMS subject', () => {
  for (const candidate of [{}, { 'x-inklu-subject': 'learner' }, { 'x-inklu-gateway': gatewayKey },
    { ...headers, 'x-inklu-subject': 'two,subjects' }, { ...headers, 'x-inklu-gateway': 's'.repeat(32) }]) {
    assert.throws(() => authenticatedLearner(candidate, gatewayKey), { status: 403 });
  }
});
