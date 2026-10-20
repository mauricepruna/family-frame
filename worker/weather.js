// Open-Meteo (free, no key) -> the shape the dashboard's weather widgets read:
//   { hi, lo, feels, humidity, wind, t[24], c[24], p[24] }   (degrees F, mph, local hour = index)

export function parseLocation(raw) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(raw || '');
  if (!m) return null;
  const lat = +m[1], lon = +m[2];
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

// WMO weather codes -> the icons the dashboard can draw.
export function iconFor(code, isDay) {
  if (code === 0 || code === 1) return isDay ? 'sun' : 'moon';
  if (code === 2) return 'partly';
  if (code === 3 || code === 45 || code === 48) return 'cloud';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'storm';
  return 'cloud';
}

export function toDashboardWeather(om) {
  const h = om.hourly;
  if ([h.temperature_2m, h.weather_code, h.precipitation_probability, h.is_day].some((a) => !Array.isArray(a) || a.length !== 24)) {
    throw new Error('expected 24 hourly values');
  }
  return {
    hi: Math.round(om.daily.temperature_2m_max[0]),
    lo: Math.round(om.daily.temperature_2m_min[0]),
    feels: Math.round(om.current.apparent_temperature),
    humidity: Math.round(om.current.relative_humidity_2m),
    wind: Math.round(om.current.wind_speed_10m),
    t: h.temperature_2m.map(Math.round),
    c: h.weather_code.map((code, i) => iconFor(code, h.is_day[i])),
    p: h.precipitation_probability.map((v) => v ?? 0)
  };
}

export function forecastUrl({ lat, lon }) {
  const q = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'temperature_2m_max,temperature_2m_min',
    current: 'apparent_temperature,relative_humidity_2m,wind_speed_10m',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'auto',
    forecast_days: 1
  });
  return 'https://api.open-meteo.com/v1/forecast?' + q;
}
