import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRinging, bearer, toDoorbellState, RING_TTL_MS } from './doorbell.js';

test('a ring is active for the TTL and then expires', () => {
  assert.equal(isRinging(1000, 1000 + RING_TTL_MS - 1), true);
  assert.equal(isRinging(1000, 1000 + RING_TTL_MS), false);
});

test('missing, invalid or future timestamps are not ringing', () => {
  assert.equal(isRinging(undefined, 5), false);
  assert.equal(isRinging(NaN, 5), false);
  assert.equal(isRinging(10, 5), false);
});

test('reads a bearer token', () => {
  assert.equal(bearer(new Request('http://x', { headers: { Authorization: 'Bearer abc' } })), 'abc');
  assert.equal(bearer(new Request('http://x')), '');
});

test('state hides the stream URL unless ringing', () => {
  assert.deepEqual(toDoorbellState(1000, 's', 2000), { ringing: true, at: 1000, stream: 's' });
  assert.deepEqual(toDoorbellState(1000, 's', 1000 + RING_TTL_MS), { ringing: false, at: null, stream: null });
});
