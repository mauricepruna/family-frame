import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPeople, publicPeople } from './family.js';

const CONFIG = JSON.stringify([
  { id: 'p1', name: 'Ana', match: ['ana'] },
  { id: 'p2', name: 'Bea', initial: 'Be', match: ['bea', 'beatriz'] }
]);

test('reads the family from the FAMILY_JSON secret', () => {
  const people = getPeople({ FAMILY_JSON: CONFIG });
  assert.equal(people.length, 2);
  assert.deepEqual(people[1].match, ['bea', 'beatriz']);
});

test('without config the family is empty so every event stays "family"', () => {
  assert.deepEqual(getPeople({}), []);
});

test('malformed config is ignored instead of crashing the calendar', () => {
  assert.deepEqual(getPeople({ FAMILY_JSON: '{not json' }), []);
  assert.deepEqual(getPeople({ FAMILY_JSON: '{"a":1}' }), []);
});

test('entries without an id are dropped and match defaults to the name', () => {
  const people = getPeople({ FAMILY_JSON: JSON.stringify([{ name: 'No id' }, { id: 'p1', name: 'Ana' }]) });
  assert.deepEqual(people, [{ id: 'p1', name: 'Ana', match: ['ana'] }]);
});

test('the public view never includes the match words', () => {
  const pub = publicPeople(getPeople({ FAMILY_JSON: CONFIG }));
  assert.deepEqual(pub, [
    { id: 'p1', name: 'Ana' },
    { id: 'p2', name: 'Bea', initial: 'Be' }
  ]);
});
