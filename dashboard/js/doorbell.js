// Full-screen doorbell overlay: polls /api/doorbell and shows the live stream while someone is ringing.
(function () {
  'use strict';
  var POLL = 3000, el = null, shownAt = null;

  function hide() {
    if (!el) return;
    el.querySelector('img').removeAttribute('src'); // closes the MJPEG connection
    el.remove();
    el = null;
  }

  function show(s) {
    if (el) return;
    el = document.createElement('div');
    el.className = 'doorbell';
    el.innerHTML = '<img alt="Doorbell camera"><div class="doorbell-tag">Someone is at the door</div>';
    el.addEventListener('click', function () { hide(); });
    el.querySelector('img').src = s.stream;
    document.body.appendChild(el);
  }

  function poll() {
    fetch('/api/doorbell', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('doorbell ' + r.status); return r.json(); })
      .then(function (s) {
        if (!s.ringing || !s.stream) { shownAt = null; hide(); return; }
        if (shownAt === s.at) return; // dismissed or already showing this ring
        shownAt = s.at;
        show(s);
      })
      .catch(function () { /* keep what is showing */ });
  }

  poll();
  setInterval(poll, POLL);
})();
