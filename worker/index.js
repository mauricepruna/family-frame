import { parseEvents, attribute } from './calendar.js';
import { getPeople, publicPeople, DEFAULT_PEOPLE } from './family.js';
import { parseLocation, forecastUrl, toDashboardWeather } from './weather.js';

const COOKIE = 'ff_key';
const YEAR = 31536000;
const DAY = 86400000;

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))));
  return crypto.subtle.timingSafeEqual(x, y);
}

function cookieValue(request) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

async function calendar(env) {
  try {
    const res = await fetch(env.CALENDAR_ICS_URL, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!res.ok) return Response.json({ error: 'calendar upstream ' + res.status }, { status: 502 });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const people = getPeople(env);
    const events = parseEvents(await res.text(), {
      from: new Date(today.getTime() - DAY),
      to: new Date(today.getTime() + 21 * DAY)
    }).map((e) => ({ ...e, people: attribute(e, people.length ? people : DEFAULT_PEOPLE) }));
    return Response.json(
      { events, people: publicPeople(people), updated: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    // The upstream URL is a credential and fetch errors can quote it: log the stack, never return it.
    console.error('calendar failed:', err && err.stack);
    return Response.json({ error: 'calendar failed' }, { status: 502 });
  }
}

async function weather(env) {
  const where = parseLocation(env.HOME_LATLON);
  if (!where) return Response.json({ error: 'HOME_LATLON is not configured' }, { status: 500 });
  try {
    const res = await fetch(forecastUrl(where), { cf: { cacheTtl: 900, cacheEverything: true } });
    if (!res.ok) return Response.json({ error: 'weather upstream ' + res.status }, { status: 502 });
    return Response.json(toDashboardWeather(await res.json()), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('weather failed:', err && err.message);
    return Response.json({ error: 'weather failed' }, { status: 502 });
  }
}

export default {
  async fetch(request, env) {
    if (!env.ACCESS_KEY) return new Response('ACCESS_KEY is not configured', { status: 500 });
    const url = new URL(request.url);

    const offered = url.searchParams.get('key');
    if (offered && (await sameSecret(offered, env.ACCESS_KEY))) {
      url.searchParams.delete('key');
      return new Response(null, {
        status: 302,
        headers: {
          Location: url.pathname + url.search,
          'Set-Cookie': `${COOKIE}=${encodeURIComponent(offered)}; Path=/; Max-Age=${YEAR}; HttpOnly; Secure; SameSite=Lax`
        }
      });
    }
    if (!(await sameSecret(cookieValue(request), env.ACCESS_KEY))) {
      return new Response('Not signed in', { status: 401 });
    }

    if (url.pathname === '/api/calendar') {
      if (!env.CALENDAR_ICS_URL) return Response.json({ error: 'CALENDAR_ICS_URL is not configured' }, { status: 500 });
      return calendar(env);
    }
    if (url.pathname === '/api/weather') return weather(env);
    return env.ASSETS.fetch(request);
  }
};
