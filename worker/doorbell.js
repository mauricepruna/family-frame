// Doorbell ring state. A bridge at home POSTs a ring; the frame polls and shows the live stream.
export const RING_TTL_MS = 60 * 1000;
export const RING_KEY = '_doorbell.json'; // lives in the photos bucket; toPhotoList skips it

export function isRinging(at, now = Date.now()) {
  return Number.isFinite(at) && now - at >= 0 && now - at < RING_TTL_MS;
}

export function bearer(request) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer (.+)$/);
  return m ? m[1] : '';
}

export function toDoorbellState(at, streamUrl, now = Date.now()) {
  const ringing = isRinging(at, now);
  return { ringing, at: ringing ? at : null, stream: ringing && streamUrl ? streamUrl : null };
}
