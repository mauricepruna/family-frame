// Full-screen doorbell overlay: polls /api/doorbell and shows the live stream while someone is ringing.
// The stream is read with fetch() instead of an <img> so the overlay knows when frames really arrive:
// it can say "Connecting...", dim and label a stalled picture, and reconnect on its own.
import { createMjpegParser } from './mjpeg.js';

var POLL = 3000;            // how often to ask the Worker whether someone is ringing
var FIRST_FRAME_MS = 10000; // no picture this long after (re)connecting: try again
var STALL_MS = 6000;        // picture was flowing but nothing for this long: treat as frozen, reconnect
var RETRY_MS = 2000;        // pause before reconnecting after the connection drops

var el = null, imgEl = null, statusEl = null;
var shownAt = null;         // the ring we last reacted to, so a dismissed ring does not reopen
var stream = '', ctl = null, attempt = 0, lastFrame = 0, startedAt = 0, hasPicture = false;
var watchdog = null, retryTimer = null, blobUrl = null;

function setStatus(text, stale) {
  statusEl.textContent = text;
  statusEl.style.display = text ? '' : 'none';
  imgEl.classList.toggle('stale', !!stale);
}

function stopStream() {
  attempt++; // results from the previous connection are ignored from here on
  clearTimeout(retryTimer);
  if (ctl) { ctl.abort(); ctl = null; }
}

function showFrame(jpeg) {
  var next = URL.createObjectURL(new Blob([jpeg], { type: 'image/jpeg' }));
  var old = blobUrl;
  blobUrl = next;
  imgEl.src = next;
  if (old) URL.revokeObjectURL(old);
  lastFrame = Date.now();
  hasPicture = true;
  setStatus('');
}

function startStream() {
  stopStream();
  var mine = attempt;
  ctl = new AbortController();
  startedAt = Date.now();
  lastFrame = 0;
  setStatus(hasPicture ? 'Reconnecting…' : 'Connecting…', hasPicture);

  var parser = createMjpegParser(function (jpeg) { if (mine === attempt) showFrame(jpeg); });
  var url = stream + (stream.indexOf('?') < 0 ? '?' : '&') + 'r=' + mine; // a fresh URL forces a fresh connection

  fetch(url, { signal: ctl.signal, cache: 'no-store' })
    .then(function (res) {
      if (!res.ok || !res.body) throw new Error('stream ' + res.status);
      var reader = res.body.getReader();
      function pump() {
        return reader.read().then(function (r) {
          if (mine !== attempt) { reader.cancel(); return; }
          if (r.done) throw new Error('stream ended');
          parser.push(r.value);
          return pump();
        });
      }
      return pump();
    })
    .catch(function () {
      if (mine !== attempt || !el) return;
      setStatus('Reconnecting…', hasPicture);
      retryTimer = setTimeout(function () { if (mine === attempt && el) startStream(); }, RETRY_MS);
    });
}

function watch() {
  if (!el) return;
  var now = Date.now();
  if (lastFrame) {
    if (now - lastFrame > STALL_MS) startStream(); // frozen picture: never leave it on screen as if it were live
  } else if (now - startedAt > FIRST_FRAME_MS) {
    setStatus('Camera is slow to respond…', hasPicture);
    startStream();
  }
}

function hide() {
  if (!el) return;
  stopStream();
  clearInterval(watchdog);
  if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
  el.remove();
  el = imgEl = statusEl = null;
}

function show(s) {
  stream = s.stream;
  hasPicture = false;
  el = document.createElement('div');
  el.className = 'doorbell';
  el.innerHTML = '<img alt="Doorbell camera"><div class="doorbell-status"></div>' +
    '<div class="doorbell-tag">Someone is at the door</div>';
  imgEl = el.querySelector('img');
  statusEl = el.querySelector('.doorbell-status');
  el.addEventListener('click', hide);
  document.body.appendChild(el);
  startStream();
  watchdog = setInterval(watch, 1000);
}

function restart(s) { // a new ring while the overlay is still open: drop the old picture, connect afresh
  stream = s.stream;
  hasPicture = false;
  imgEl.removeAttribute('src');
  if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
  startStream();
}

function poll() {
  fetch('/api/doorbell', { credentials: 'same-origin' })
    .then(function (r) { if (!r.ok) throw new Error('doorbell ' + r.status); return r.json(); })
    .then(function (s) {
      if (!s.ringing || !s.stream) { shownAt = null; hide(); return; }
      if (shownAt === s.at) return; // already handling (or dismissed) this ring
      shownAt = s.at;
      if (el) restart(s); else show(s);
    })
    .catch(function () { /* keep what is showing */ });
}

poll();
setInterval(poll, POLL);
