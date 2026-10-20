import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDashboardWeather, iconFor, parseLocation, forecastUrl } from './weather.js';

const hours = (fill) => Array.from({ length: 24 }, (_, i) => (typeof fill === 'function' ? fill(i) : fill));

const openMeteo = (over = {}) => ({
  hourly: {
    temperature_2m: hours((i) => 8 + i / 3),
    weather_code: hours(0),
    precipitation_probability: hours(0),
    is_day: hours((i) => (i >= 7 && i < 19 ? 1 : 0)),
    ...over.hourly
  },
  daily: { temperature_2m_max: [17.4], temperature_2m_min: [7.6], ...over.daily },
  current: { apparent_temperature: -1.6, relative_humidity_2m: 71, wind_speed_10m: 17.5, ...over.current }
});

test('returns the dashboard shape with 24 hourly slots', () => {
  const w = toDashboardWeather(openMeteo());
  assert.equal(w.t.length, 24);
  assert.equal(w.c.length, 24);
  assert.equal(w.p.length, 24);
  assert.deepEqual([w.hi, w.lo, w.feels, w.humidity, w.wind], [17, 8, -2, 71, 18]);
});

test('temperatures are rounded to whole degrees', () => {
  const w = toDashboardWeather(openMeteo({ hourly: { temperature_2m: hours(10.6) } }));
  assert.equal(w.t[0], 11);
});

test('a missing rain probability counts as 0', () => {
  const w = toDashboardWeather(openMeteo({ hourly: { precipitation_probability: hours((i) => (i === 3 ? null : 40)) } }));
  assert.equal(w.p[3], 0);
  assert.equal(w.p[4], 40);
});

test('clear sky is a sun by day and a moon by night', () => {
  assert.equal(iconFor(0, 1), 'sun');
  assert.equal(iconFor(0, 0), 'moon');
  assert.equal(iconFor(1, 0), 'moon');
});

test('weather codes map onto the icons the dashboard can draw', () => {
  assert.equal(iconFor(2, 1), 'partly');
  assert.equal(iconFor(3, 1), 'cloud');
  assert.equal(iconFor(45, 1), 'cloud');
  for (const code of [51, 55, 61, 65, 66, 80, 82]) assert.equal(iconFor(code, 1), 'rain', 'code ' + code);
  for (const code of [71, 75, 77, 85, 86]) assert.equal(iconFor(code, 1), 'snow', 'code ' + code);
  for (const code of [95, 96, 99]) assert.equal(iconFor(code, 1), 'storm', 'code ' + code);
});

test('an unknown code falls back to a cloud instead of breaking the page', () => {
  assert.equal(iconFor(1234, 1), 'cloud');
});

test('a forecast that is not 24 hours long is rejected', () => {
  assert.throws(() => toDashboardWeather(openMeteo({ hourly: { temperature_2m: hours(5).slice(0, 12) } })), /24/);
});

test('location parses "lat,lon" and rejects nonsense', () => {
  assert.deepEqual(parseLocation('43.65, -79.38'), { lat: 43.65, lon: -79.38 });
  assert.equal(parseLocation(''), null);
  assert.equal(parseLocation(undefined), null);
  assert.equal(parseLocation('toronto'), null);
  assert.equal(parseLocation('95,10'), null);
  assert.equal(parseLocation('10,200'), null);
});

test('the forecast is requested in Fahrenheit and mph for the same coordinates', () => {
  const q = new URL(forecastUrl({ lat: 40.7, lon: -74 })).searchParams;
  assert.equal(q.get('temperature_unit'), 'fahrenheit');
  assert.equal(q.get('wind_speed_unit'), 'mph');
  assert.equal(q.get('latitude'), '40.7');
  assert.equal(q.get('longitude'), '-74');
  assert.equal(q.get('forecast_days'), '1');
});
