// Replaces the demo calendar with the family's real events from the Worker (/api/calendar).
// If the request fails, whatever is on screen stays (the demo events, or the last good load).
(function () {
  'use strict';
  var App = window.App, D = window.DATA;
  var REFRESH = 5 * 60 * 1000;

  function day(s) {
    var p = s.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function convert(e) {
    var out = { id: e.id, title: e.title, allDay: e.allDay, people: e.people };
    out.start = e.allDay ? day(e.start) : new Date(e.start);
    out.end = e.allDay ? day(e.end) : new Date(e.end);
    if (e.loc) out.loc = e.loc;
    if (e.notes) out.notes = e.notes;
    return out;
  }

  function load() {
    fetch('/api/calendar', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('calendar ' + r.status); return r.json(); })
      .then(function (body) {
        (body.people || []).forEach(function (p) {
          var mine = App.person(p.id);
          if (!mine) return;
          mine.name = p.name;
          if (p.initial) mine.initial = p.initial;
        });
        D.events.length = 0;
        body.events.forEach(function (e) { D.events.push(convert(e)); });
        App.emit('data');
      })
      .catch(function () { /* keep what is showing */ });
  }

  function loadWeather() {
    fetch('/api/weather', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('weather ' + r.status); return r.json(); })
      .then(function (w) {
        if (!w || !w.t || w.t.length !== 24 || w.c.length !== 24 || w.p.length !== 24) throw new Error('weather shape');
        Object.keys(w).forEach(function (k) { D.weather[k] = w[k]; });
        App.emit('data');
      })
      .catch(function () { /* keep what is showing */ });
  }

  // Real photos from R2 replace the demo ones; with none uploaded the demo set stays.
  function loadPhotos() {
    fetch('/api/photos', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('photos ' + r.status); return r.json(); })
      .then(function (list) {
        if (!Array.isArray(list) || !list.length) return;
        var sig = list.map(function (p) { return p.key; }).sort().join('|');
        if (sig === D.photosSig) return;
        D.photosSig = sig;
        D.photosRev = (D.photosRev || 0) + 1; // slideshows rebuild their queue when this changes
        D.photos.length = 0;
        list.forEach(function (p) { D.photos.push(p); });
        App.emit('data');
      })
      .catch(function () { /* keep what is showing */ });
  }

  load();
  setInterval(load, REFRESH);
  loadWeather();
  setInterval(loadWeather, 2 * REFRESH);
  loadPhotos();
  setInterval(loadPhotos, REFRESH);
})();
