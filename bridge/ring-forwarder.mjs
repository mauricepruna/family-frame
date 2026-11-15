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

// True when the camera has sent no video for `gap` ms (or never): the P2P stream failed to start or was dropped.
export function streamStalled(lastChunk, now, gap = 4000) {
  return now - lastChunk > gap;
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
    // A ring wakes the doorbell and the Eufy app grabs a stream too, so the first start can silently fail.
    // Ask again every few seconds until video actually flows.
    retryTimer = setInterval(() => { if (streamStalled(lastChunk, Date.now())) { console.log('livestream: no video yet, retrying'); send('device.start_livestream'); } }, 4000);
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

  createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname !== '/stream.mjpeg' || u.searchParams.get('t') !== STREAM_TOKEN) { res.writeHead(401).end(); return; }
    res.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=frame', 'Cache-Control': 'no-store' });
    clients.add(res);
    startVideo(); // a viewer connecting also wakes the camera
    req.on('close', () => clients.delete(res));
  }).listen(+PORT);

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
