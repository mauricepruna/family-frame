// Doorbell bridge for a wired Eufy doorbell (no RTSP, so P2P). One process does three jobs:
//  1. listens to eufy-security-ws for the "rings" event and tells the Worker,
//  2. starts the P2P livestream on a ring and pipes the H.264 into ffmpeg,
//  3. serves ffmpeg's output as MJPEG at /stream.mjpeg?t=<STREAM_TOKEN> (put this behind a tunnel).
// Env: EUFY_WS, WORKER_URL, DOORBELL_TOKEN, DOORBELL_SERIAL, STREAM_TOKEN, PORT (8554).
// Needs Node 22+ and ffmpeg on PATH.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

export function isRing(msg, serial) {
  const e = msg && msg.type === 'event' && msg.event;
  return !!e && e.source === 'device' && e.event === 'rings' && e.state !== false &&
    (!serial || e.serialNumber === serial);
}

// Returns the H.264 bytes of a "livestream video data" event for this camera, else null.
export function videoChunk(msg, serial) {
  const e = msg && msg.type === 'event' && msg.event;
  if (!e || e.source !== 'device' || e.event !== 'livestream video data' || e.serialNumber !== serial) return null;
  const d = e.buffer && e.buffer.data;
  return Array.isArray(d) ? Buffer.from(d) : null;
}

export function splitJpegs(state, chunk) { // pulls whole JPEGs (FFD8..FFD9) out of an ffmpeg pipe
  let buf = Buffer.concat([state.rest, chunk]);
  const frames = [];
  for (;;) {
    const s = buf.indexOf(Buffer.from([0xff, 0xd8]));
    const e = s < 0 ? -1 : buf.indexOf(Buffer.from([0xff, 0xd9]), s + 2);
    if (e < 0) break;
    frames.push(buf.subarray(s, e + 2));
    buf = buf.subarray(e + 2);
  }
  state.rest = buf;
  return frames;
}

// True when the stream needs a reset. Video takes 2-3 s to start, so the first video gets 8 s from the start request;
// once video was flowing, 5 s of silence means it died. Resetting too eagerly kills a start that was about to work.
export function streamStalled(lastChunk, startedAt, now) {
  return lastChunk ? now - lastChunk > 5000 : now - startedAt > 8000;
}

// The frame's page (served by the Worker) reads this stream with fetch(), which needs a CORS header for that
// one origin. Empty string means "send none".
export function originOf(url) {
  try { return new URL(url).origin; } catch { return ''; }
}

const LIVE_MS = 60 * 1000;

async function main() {
  const { EUFY_WS = 'ws://localhost:3000', WORKER_URL, DOORBELL_TOKEN, DOORBELL_SERIAL, STREAM_TOKEN, PORT = '8554' } = process.env;
  if (!WORKER_URL || !DOORBELL_TOKEN || !DOORBELL_SERIAL || !STREAM_TOKEN) {
    throw new Error('WORKER_URL, DOORBELL_TOKEN, DOORBELL_SERIAL and STREAM_TOKEN are required');
  }
  const clients = new Set();
  let ffmpeg = null, stopTimer = null, retryTimer = null, ws = null, lastRing = 0, lastChunk = 0, startedAt = 0;

  const send = (command, extra = {}) => ws && ws.readyState === 1 &&
    ws.send(JSON.stringify({ messageId: command + Date.now(), command, serialNumber: DOORBELL_SERIAL, ...extra }));

  function startVideo() {
    clearTimeout(stopTimer);
    stopTimer = setTimeout(stopVideo, LIVE_MS);
    if (ffmpeg) return;
    lastChunk = 0; startedAt = Date.now();
    console.log('livestream: start requested');
    send('device.start_livestream');
    // A ring wakes the doorbell and the Eufy app can grab a stream too, so a start can silently fail.
    // If no video shows up in time, release the stream and start it again.
    retryTimer = setInterval(() => {
      if (!streamStalled(lastChunk, startedAt, Date.now())) return;
      console.log('livestream: no video, resetting the stream');
      send('device.stop_livestream');
      setTimeout(() => send('device.start_livestream'), 1000);
      lastChunk = 0; startedAt = Date.now(); // the new attempt gets its own grace period
    }, 2000);
    ffmpeg = spawn('ffmpeg', ['-loglevel', 'error', '-f', 'h264', '-i', 'pipe:0',
      '-vf', 'fps=8,scale=-2:480', '-q:v', '7', '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1']);
    const st = { rest: Buffer.alloc(0) };
    ffmpeg.stdout.on('data', (c) => splitJpegs(st, c).forEach((f) => clients.forEach((res) => {
      res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${f.length}\r\n\r\n`);
      res.write(f); res.write('\r\n');
    })));
    ffmpeg.stdin.on('error', () => {});
    ffmpeg.on('error', (err) => { console.error('ffmpeg failed:', err.message); ffmpeg = null; });
    ffmpeg.on('close', () => { ffmpeg = null; });
  }
  function stopVideo() {
    clearInterval(retryTimer);
    console.log('livestream: stop');
    send('device.stop_livestream');
    if (ffmpeg) { ffmpeg.stdin.end(); ffmpeg.kill(); }
    ffmpeg = null;
  }

  // Test mode (FAKE_STREAM=1): serve a moving test pattern instead of the camera, so the frame, Worker and
  // overlay can be tested without pressing the doorbell. 30 s, then the stream ends.
  function fakeStream(res) {
    const p = spawn('ffmpeg', ['-loglevel', 'error', '-re', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=8',
      '-t', '30', '-q:v', '7', '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1']);
    const st = { rest: Buffer.alloc(0) };
    p.stdout.on('data', (c) => splitJpegs(st, c).forEach((f) => {
      res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${f.length}\r\n\r\n`);
      res.write(f); res.write('\r\n');
    }));
    p.on('close', () => res.end());
    res.on('close', () => p.kill());
  }

  createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname !== '/stream.mjpeg' || u.searchParams.get('t') !== STREAM_TOKEN) { res.writeHead(401).end(); return; }
    const cors = originOf(WORKER_URL);
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame', 'Cache-Control': 'no-store',
      ...(cors && { 'Access-Control-Allow-Origin': cors })
    });
    res.flushHeaders(); // confirm the connection right away; the first frame can take seconds
    if (process.env.FAKE_STREAM === '1') { console.log('test mode: serving test pattern'); fakeStream(res); return; }
    clients.add(res);
    startVideo(); // a viewer connecting also wakes the camera
    req.on('close', () => clients.delete(res));
  }).listen(+PORT);

  // On restart or shutdown, release the camera's stream first; dropping the connection mid-stream leaves it hanging.
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    stopVideo();
    setTimeout(() => process.exit(0), 500);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  const connect = () => {
    ws = new WebSocket(EUFY_WS);
    ws.onopen = () => {
      ws.send(JSON.stringify({ messageId: 'schema', command: 'set_api_schema', schemaVersion: 21 }));
      ws.send(JSON.stringify({ messageId: 'listen', command: 'start_listening' }));
    };
    ws.onmessage = async (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      const v = videoChunk(msg, DOORBELL_SERIAL);
      if (v) { if (!lastChunk) console.log(`livestream: first video data after ${Date.now() - startedAt} ms`); lastChunk = Date.now(); if (ffmpeg) ffmpeg.stdin.write(v); return; }
      if (!isRing(msg, DOORBELL_SERIAL) || Date.now() - lastRing < 5000) return;
      lastRing = Date.now();
      startVideo(); // begin the stream before the frame asks for it
      const r = await fetch(new URL('/api/doorbell/ring', WORKER_URL), {
        method: 'POST', headers: { Authorization: 'Bearer ' + DOORBELL_TOKEN }
      }).catch((err) => ({ ok: false, status: String(err) }));
      console.log('ring forwarded:', r.ok ? 'ok' : 'failed ' + r.status);
    };
    ws.onclose = () => setTimeout(connect, 5000);
    ws.onerror = () => ws.close();
  };
  connect();
}
if (import.meta.url === `file://${process.argv[1]}`) main();
