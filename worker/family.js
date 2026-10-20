// Who is in the family comes from the FAMILY_JSON secret, never from this repo:
//   [{ "id": "p1", "name": "Ana", "initial": "An", "match": ["ana"] }, ...]
// `id` ties a person to the dashboard's chores, stars and routines (p1, p2, p3, p4).
// `match` is what a calendar title or note must contain to credit the event to that person
// (defaults to the lower-cased name). `initial` overrides the avatar letter.
export const DEFAULT_PEOPLE = ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id, match: [] }));

export function getPeople(env) {
  let raw;
  try { raw = JSON.parse(env.FAMILY_JSON || '[]'); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && typeof p.id === 'string' && p.id)
    .map((p) => {
      const out = { id: p.id, name: String(p.name || p.id), match: (p.match || [String(p.name || '')]).filter(Boolean).map((m) => String(m).toLowerCase()) };
      if (p.initial) out.initial = String(p.initial);
      return out;
    });
}

export function publicPeople(people) {
  return people.map(({ match, ...rest }) => rest);
}
