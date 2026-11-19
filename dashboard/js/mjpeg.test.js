import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMjpegParser } from './mjpeg.js';

const part = (bytes) => Buffer.concat([
  Buffer.from(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${bytes.length}\r\n\r\n`),
  Buffer.from(bytes), Buffer.from('\r\n')
]);

function collect() {
  const frames = [];
  return { frames, parser: createMjpegParser((f) => frames.push([...f])) };
}

test('parses a single frame delivered in one chunk', () => {
  const { frames, parser } = collect();
  parser.push(part([0xff, 0xd8, 1, 2, 0xff, 0xd9]));
  assert.deepEqual(frames, [[0xff, 0xd8, 1, 2, 0xff, 0xd9]]);
});

test('parses several frames in one chunk', () => {
  const { frames, parser } = collect();
  parser.push(Buffer.concat([part([1, 2, 3]), part([4, 5])]));
  assert.deepEqual(frames, [[1, 2, 3], [4, 5]]);
});

test('reassembles a frame split across arbitrary chunks, even byte by byte', () => {
  const { frames, parser } = collect();
  const all = Buffer.concat([part([9, 8, 7, 6]), part([5])]);
  for (const b of all) parser.push(Uint8Array.of(b));
  assert.deepEqual(frames, [[9, 8, 7, 6], [5]]);
});

test('does not emit a frame until all of its bytes have arrived', () => {
  const { frames, parser } = collect();
  const p = part([1, 2, 3, 4]);
  parser.push(p.subarray(0, p.length - 4));
  assert.equal(frames.length, 0);
  parser.push(p.subarray(p.length - 4));
  assert.deepEqual(frames, [[1, 2, 3, 4]]);
});

test('skips a part with no Content-Length instead of getting stuck', () => {
  const { frames, parser } = collect();
  parser.push(Buffer.from('--frame\r\nContent-Type: image/jpeg\r\n\r\n'));
  parser.push(part([7]));
  assert.deepEqual(frames, [[7]]);
});
