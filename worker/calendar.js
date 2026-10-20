import ICAL from 'ical.js';

const MAX_OCCURRENCES = 1000;
const DAY = 86400000;

function wallClockToUtc(t, tzid) {
  const wall = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  const offsetAt = (ms) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: tzid, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric'
      }).formatToParts(new Date(ms)).map((x) => [x.type, +x.value])
    );
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms;
  };
  const first = wall - offsetAt(wall);
  return new Date(wall - offsetAt(first));
}

function tzidOf(item) {
  const p = item.component.getFirstProperty('dtstart');
  return p ? p.getParameter('tzid') : null;
}

function isFloating(t) {
  return !t.zone || t.zone === ICAL.Timezone.localTimezone || t.zone.tzid === 'floating';
}

function toIso(t, tzid) {
  if (tzid && isFloating(t)) {
    try { return wallClockToUtc(t, tzid).toISOString(); } catch { /* unknown zone name, fall through */ }
  }
  return t.toJSDate().toISOString();
}

function record(item, start, end, allDay) {
  const out = {
    id: item.uid + '@' + start,
    title: item.summary || '(no title)',
    allDay,
    start: allDay ? start.slice(0, 10) : start,
    end: allDay ? end.slice(0, 10) : end
  };
  if (item.location) out.loc = item.location;
  if (item.description) out.notes = item.description;
  return out;
}

function toRecord(item, startT, endT) {
  const allDay = startT.isDate;
  const tzid = tzidOf(item);
  return record(item, allDay ? startT.toString() : toIso(startT, tzid), allDay ? endT.toString() : toIso(endT, tzid), allDay);
}

function overlaps(r, from, to) {
  // All-day values are plain dates; a day of slack either side covers any timezone.
  const s = r.allDay ? Date.parse(r.start) - DAY : Date.parse(r.start);
  const e = r.allDay ? Date.parse(r.end) + DAY : Date.parse(r.end);
  return e > from.getTime() && s < to.getTime();
}

export function parseEvents(text, { from, to }) {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try { ICAL.TimezoneService.register(tz); } catch { /* duplicate or malformed zone */ }
  }

  const masters = new Map();
  const exceptions = [];
  for (const c of root.getAllSubcomponents('vevent')) {
    if (c.hasProperty('recurrence-id')) exceptions.push(new ICAL.Event(c));
    else masters.set(c.getFirstPropertyValue('uid'), new ICAL.Event(c));
  }

  const out = [];
  const orphans = [];
  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    if (master) master.relateException(ex);
    else orphans.push(ex);
  }

  for (const ev of masters.values()) {
    if (!ev.isRecurring()) {
      out.push(toRecord(ev, ev.startDate, ev.endDate));
      continue;
    }
    const it = ev.iterator();
    for (let n = 0, next; n < MAX_OCCURRENCES && (next = it.next()); n++) {
      const d = ev.getOccurrenceDetails(next);
      if (d.startDate.toJSDate() > to) break;
      out.push(toRecord(d.item, d.startDate, d.endDate));
    }
  }
  for (const ex of orphans) out.push(toRecord(ex, ex.startDate, ex.endDate));

  return out
    .filter((r) => overlaps(r, from, to))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function attribute(event, people) {
  const text = `${event.title || ''} ${event.notes || ''}`.toLowerCase();
  const hit = people.filter((p) =>
    p.match.some((name) => new RegExp(`(^|[^\\p{L}])${name.toLowerCase()}($|[^\\p{L}])`, 'u').test(text))
  );
  return (hit.length ? hit : people).map((p) => p.id);
}
