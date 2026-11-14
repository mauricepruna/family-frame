import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRing } from './ring-forwarder.mjs';

const ring = (o = {}) => ({ type: 'event', event: { source: 'device', event: 'rings', serialNumber: 'T8', state: true, ...o } });

test('a rings event is a ring', () => assert.equal(isRing(ring()), true));
test('state false (ring ended) is ignored', () => assert.equal(isRing(ring({ state: false })), false));
test('other events and junk are ignored', () => {
  assert.equal(isRing(ring({ event: 'motion detected' })), false);
  assert.equal(isRing({ type: 'result' }), false);
  assert.equal(isRing(null), false);
});
test('serial filter only passes the chosen doorbell', () => {
  assert.equal(isRing(ring(), 'T8'), true);
  assert.equal(isRing(ring(), 'OTHER'), false);
});

import { videoChunk, splitJpegs } from './ring-forwarder.mjs';

test('video chunk becomes bytes only for the chosen camera', () => {
  const m = { type: 'event', event: { source: 'device', event: 'livestream video data', serialNumber: 'T8', buffer: { type: 'Buffer', data: [0, 0, 0, 1, 103] } } };
  assert.deepEqual([...videoChunk(m, 'T8')], [0, 0, 0, 1, 103]);
  assert.equal(videoChunk(m, 'OTHER'), null);
  assert.equal(videoChunk({ type: 'result' }, 'T8'), null);
});

test('splitJpegs extracts whole frames and keeps the partial tail', () => {
  const a = Buffer.from([0xff, 0xd8, 1, 2, 0xff, 0xd9]);
  const b = Buffer.from([0xff, 0xd8, 3]);
  const st = { rest: Buffer.alloc(0) };
  assert.equal(splitJpegs(st, Buffer.concat([a, b])).length, 1);
  const more = splitJpegs(st, Buffer.from([4, 0xff, 0xd9]));
  assert.equal(more.length, 1);
  assert.deepEqual([...more[0]], [0xff, 0xd8, 3, 4, 0xff, 0xd9]);
});
