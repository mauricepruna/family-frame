import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePhoto, toPhotoList, photoKey } from './photos.js';

test('reads date, place and orientation from the file name', () => {
  assert.deepEqual(parsePhoto('2024-05-19_Humber-Bay-Park_p.jpg'), {
    key: '2024-05-19_Humber-Bay-Park_p.jpg', date: '2024-05-19', place: 'Humber Bay Park', o: 'p', tag: '2024-05-19'
  });
});

test('orientation defaults to landscape and place to empty', () => {
  assert.equal(parsePhoto('2023-08-12_Lake-of-Bays.webp').o, 'l');
  const bare = parsePhoto('2023-08-12.JPG');
  assert.equal(bare.place, '');
  assert.equal(bare.o, 'l');
});

test('files that are not dated images are skipped', () => {
  assert.equal(parsePhoto('notes.txt'), null);
  assert.equal(parsePhoto('IMG_1234.jpg'), null);
  assert.equal(parsePhoto('2024-13-45_Nowhere.jpg'), null);
  assert.equal(parsePhoto('folder/2024-05-19.jpg'), null);
});

test('toPhotoList drops junk and keeps order', () => {
  const list = toPhotoList(['a.txt', '2024-01-01_A.jpg', '2024-02-02_B_p.png']);
  assert.deepEqual(list.map((p) => p.place), ['A', 'B']);
});

test('photoKey only accepts keys that parse as photos', () => {
  assert.equal(photoKey('/photos/2024-05-19_Park.jpg'), '2024-05-19_Park.jpg');
  assert.equal(photoKey('/photos/2024-05-19_Park%20x.jpg'), null);
  assert.equal(photoKey('/photos/../secret.jpg'), null);
  assert.equal(photoKey('/photos/'), null);
});

test('a ~suffix keeps same-day photos distinct without changing the caption', () => {
  const p = parsePhoto('2024-05-19_Park_p~123456.jpg');
  assert.equal(p.place, 'Park');
  assert.equal(p.o, 'p');
  assert.equal(p.key, '2024-05-19_Park_p~123456.jpg');
  assert.equal(parsePhoto('2024-05-19~1.jpg').date, '2024-05-19');
});
