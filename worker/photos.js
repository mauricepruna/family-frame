// Family photos live in the PHOTOS R2 bucket. Metadata comes from the file name:
//   YYYY-MM-DD[_Place-Name][_p].jpg   (_p = portrait; landscape is the default)
const NAME = /^(\d{4}-\d{2}-\d{2})(?:_([\p{L}\p{N}-]+?))?(?:_([lp]))?(?:~[\p{L}\p{N}]+)?\.(?:jpe?g|png|webp|avif)$/iu;

export function parsePhoto(key) {
  const m = NAME.exec(key);
  if (!m) return null;
  const [, date, place = '', o = 'l'] = m;
  const d = new Date(date + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) return null;
  return { key, date, place: place.replace(/-/g, ' '), o: o.toLowerCase(), tag: date };
}

export function toPhotoList(keys) {
  return keys.map(parsePhoto).filter(Boolean);
}

export function photoKey(pathname) {
  if (!pathname.startsWith('/photos/')) return null;
  const key = pathname.slice('/photos/'.length);
  return parsePhoto(key) ? key : null;
}
