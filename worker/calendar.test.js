import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEvents, attribute } from './calendar.js';

const PEOPLE = [
  { id: 'p1', match: ['ana'] },
  { id: 'p2', match: ['bea'] },
  { id: 'p3', match: ['cleo'] },
  { id: 'p4', match: ['dina'] }
];

const ics = (body) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n${body}END:VCALENDAR\r\n`;
const RANGE = { from: new Date('2026-10-19T00:00:00Z'), to: new Date('2026-10-26T00:00:00Z') };

test('timed event inside range is returned with ISO times', () => {
  const out = parseEvents(ics(
    'BEGIN:VEVENT\r\nUID:a1\r\nDTSTART:20261020T150000Z\r\nDTEND:20261020T160000Z\r\nSUMMARY:Dentist\r\nLOCATION:Bright Smiles\r\nEND:VEVENT\r\n'
  ), RANGE);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'Dentist');
  assert.equal(out[0].loc, 'Bright Smiles');
  assert.equal(out[0].allDay, false);
  assert.equal(out[0].start, '2026-10-20T15:00:00.000Z');
  assert.equal(out[0].end, '2026-10-20T16:00:00.000Z');
});

test('event outside range is dropped', () => {
  const out = parseEvents(ics(
    'BEGIN:VEVENT\r\nUID:a2\r\nDTSTART:20261201T150000Z\r\nDTEND:20261201T160000Z\r\nSUMMARY:Later\r\nEND:VEVENT\r\n'
  ), RANGE);
  assert.equal(out.length, 0);
});

test('all-day event keeps plain dates, end exclusive', () => {
  const out = parseEvents(ics(
    'BEGIN:VEVENT\r\nUID:a3\r\nDTSTART;VALUE=DATE:20261021\r\nDTEND;VALUE=DATE:20261023\r\nSUMMARY:School trip\r\nEND:VEVENT\r\n'
  ), RANGE);
  assert.equal(out[0].allDay, true);
  assert.equal(out[0].start, '2026-10-21');
  assert.equal(out[0].end, '2026-10-23');
});

test('weekly recurring event expands into every occurrence in range', () => {
  const out = parseEvents(ics(
    'BEGIN:VEVENT\r\nUID:a4\r\nDTSTART:20261019T210000Z\r\nDTEND:20261019T213000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nSUMMARY:Piano\r\nEND:VEVENT\r\n'
  ), RANGE);
  assert.deepEqual(out.map((e) => e.start), [
    '2026-10-19T21:00:00.000Z',
    '2026-10-20T21:00:00.000Z',
    '2026-10-21T21:00:00.000Z'
  ]);
});

test('an edited occurrence replaces the original and a deleted one disappears', () => {
  const out = parseEvents(ics(
    'BEGIN:VEVENT\r\nUID:a5\r\nDTSTART:20261019T210000Z\r\nDTEND:20261019T213000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEXDATE:20261020T210000Z\r\nSUMMARY:Soccer\r\nEND:VEVENT\r\n' +
    'BEGIN:VEVENT\r\nUID:a5\r\nRECURRENCE-ID:20261021T210000Z\r\nDTSTART:20261021T220000Z\r\nDTEND:20261021T223000Z\r\nSUMMARY:Soccer (moved)\r\nEND:VEVENT\r\n'
  ), RANGE);
  assert.deepEqual(out.map((e) => [e.title, e.start]), [
    ['Soccer', '2026-10-19T21:00:00.000Z'],
    ['Soccer (moved)', '2026-10-21T22:00:00.000Z']
  ]);
});

test('timezone-qualified event converts to the right UTC instant', () => {
  const out = parseEvents(ics(
    'BEGIN:VEVENT\r\nUID:a6\r\nDTSTART;TZID=America/Toronto:20261020T090000\r\nDTEND;TZID=America/Toronto:20261020T100000\r\nSUMMARY:Standup\r\nEND:VEVENT\r\n'
  ), RANGE);
  // EDT is UTC-4 on 2026-10-20
  assert.equal(out[0].start, '2026-10-20T13:00:00.000Z');
});

test('attribute matches whole names in the title, case-insensitively', () => {
  assert.deepEqual(attribute({ title: 'Dentist - Dina' }, PEOPLE), ['p4']);
  assert.deepEqual(attribute({ title: 'ANA & Bea: dinner' }, PEOPLE), ['p1', 'p2']);
});

test('attribute also looks in the notes', () => {
  assert.deepEqual(attribute({ title: 'Soccer', notes: 'drive Cleo' }, PEOPLE), ['p3']);
});

test('attribute does not match inside other words', () => {
  assert.deepEqual(attribute({ title: 'Dinaville trip' }, PEOPLE), ['p1', 'p2', 'p3', 'p4']);
});

test('unmatched events belong to the whole family', () => {
  assert.deepEqual(attribute({ title: 'Garbage night' }, PEOPLE), ['p1', 'p2', 'p3', 'p4']);
});

test('a weekly zoned series keeps its local time across the DST change', () => {
  const out = parseEvents(ics(
    'BEGIN:VEVENT\r\nUID:a7\r\nDTSTART;TZID=America/New_York:20261030T160000\r\nDTEND;TZID=America/New_York:20261030T170000\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nSUMMARY:Weekly\r\nEND:VEVENT\r\n'
  ), { from: new Date('2026-10-29T00:00:00Z'), to: new Date('2026-11-20T00:00:00Z') });
  // US daylight saving ends 2026-11-01: 4 PM is 20:00Z before it and 21:00Z after.
  assert.deepEqual(out.map((e) => e.start), [
    '2026-10-30T20:00:00.000Z',
    '2026-11-06T21:00:00.000Z',
    '2026-11-13T21:00:00.000Z'
  ]);
});
