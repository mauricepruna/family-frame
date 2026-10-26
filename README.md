# family-frame

A wall-mounted family dashboard for an old Android photo frame: today's schedule, calendar,
chores, shopping, photos and weather on one screen, driven by your own data.

It is built on [wesbos/photo-frame-dashboard](https://github.com/wesbos/photo-frame-dashboard)
(MIT). That project is a polished prototype with mock data; this one adds a real backend, a
private calendar feed, access control, and keeps the family's details out of the repository.

```
 Android frame ──► kiosk app ──► Cloudflare Worker ──► your calendar (private iCal link)
 (WebView 106)    (fullscreen     │  serves the page
                   browser)       │  /api/calendar
                                  └─ everything behind an access key
```

## What works today

| View | Data |
| --- | --- |
| Calendar, Today | **Real**: a Google Calendar via its private iCal link, recurring events included |
| Weather | **Real**: [Open-Meteo](https://open-meteo.com) (free, no key), in °F and mph |
| Chores, shopping, photos, home | Demo data from the original prototype |

Events are credited to family members by finding their names in the event title or notes
(`Dentist - Ana`). Events with no name belong to the whole family.

## Layout

| Folder | What it is |
| --- | --- |
| `dashboard/` | The web UI (plain JS, built with Vite) and the Worker's deploy config |
| `worker/` | Cloudflare Worker: access gate, `/api/calendar`, `/api/weather`, iCal parsing. Has tests |
| `kiosk/` | Android app: a fullscreen WebView that opens the dashboard and survives reboots |
| `terraform/` | OpenTofu/Terraform config to reproduce the Worker, assets and secrets in another Cloudflare account |

## Deploy the dashboard and Worker

You need a free Cloudflare account and a recent Node (the dashboard uses Vite 8).

To reproduce the Cloudflare side of this (Worker, assets, secrets) from scratch in a different
account, see [`terraform/`](terraform/) instead — it's an OpenTofu/Terraform equivalent of the
steps below.

```sh
cd dashboard
npm install
npx wrangler login
npm run deploy          # builds the UI and deploys the Worker; prints your workers.dev URL
```

There's also a [`justfile`](justfile) with shortcuts for the commands on this page — run
`just --list` from the repo root (needs [`just`](https://github.com/casey/just)).

Then set four secrets (each command prompts for the value, so nothing lands in shell history):

```sh
npx wrangler secret put ACCESS_KEY        # a long random string: openssl rand -hex 24
npx wrangler secret put CALENDAR_ICS_URL  # Google Calendar > Settings > your calendar >
                                          # Integrate calendar > Secret address in iCal format
npx wrangler secret put FAMILY_JSON       # see below
npx wrangler secret put HOME_LATLON       # "lat,lon" of your town, e.g. 40.71,-74.01
```

`HOME_LATLON` only needs to be accurate to the town (two decimals is about 1 km), so use a
city-centre point, not your street address. Look one up with
`https://geocoding-api.open-meteo.com/v1/search?name=<town>`. It stays a secret so your
location isn't in the repository. To change units, edit `forecastUrl` in `worker/weather.js`
(and the "cool" cutoff in `weatherNow` in `dashboard/js/app.js`, which is in °F).

`CALENDAR_ICS_URL` is effectively a password: anyone holding it can read the whole calendar. It
only ever lives as a Worker secret, never in the page, the app or this repository.

`FAMILY_JSON` names the people, so no names are stored in the code:

```json
[
  { "id": "p1", "name": "Ana", "match": ["ana"] },
  { "id": "p2", "name": "Ben", "initial": "Be", "match": ["ben", "benjamin"] }
]
```

`id` must be `p1` to `p4` (it ties a person to the chores and stars in the demo data). `match` is
what an event title or note must contain to credit that person (default: the lower-cased name).
`initial` overrides the avatar letter, handy when two names start with the same one.

### Signing in

Every request needs the access key. Open the site once with the key and the Worker sets a
long-lived `HttpOnly` cookie:

```
https://<your-worker>.workers.dev/?key=<ACCESS_KEY>
```

Without it the site answers `401`. The key is never stored on the frame, only the cookie.

### Run the tests

```sh
cd worker
npm install
npm test
```

## The kiosk app (Android frame)

The kiosk is the HOME app: it opens the saved URL fullscreen on every boot and shows its own
screen when the frame has no Wi-Fi. Hold two fingers still for 1.5 s to open its controls.
See [`kiosk/README.md`](kiosk/README.md) for details.

Build (needs JDK 17 and the Android SDK command-line tools):

```sh
brew install openjdk@17 && brew install --cask android-commandlinetools
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
sdkmanager --sdk_root=$ANDROID_HOME "build-tools;34.0.0" "platforms;android-34"
KIOSK_URL=https://<your-worker>.workers.dev/ bash kiosk/build.sh   # writes kiosk/build/homehq.apk
```

`KIOSK_URL` bakes your site in as the address a fresh or reset frame opens. It is substituted in
a build copy only, so the repository never contains your address. Leave it out and the app opens
the original author's demo. Never put the access key in it.

Install, then sign in in two steps. Do **not** put the key in the saved URL: the app stores that
verbatim, so the key would sit in plain text on the frame.

```sh
adb install -r kiosk/build/homehq.apk
# 1. save the plain address (not needed if you built with KIOSK_URL)
adb shell am start -n app.familyframe/.MainActivity --es url 'https://<your-worker>.workers.dev/' --ez home true
# 2. open the key link once. A VIEW link is shown but not saved; the site's cookie remembers you
adb shell am start -a android.intent.action.VIEW -d 'https://<your-worker>.workers.dev/?key=<ACCESS_KEY>' -n app.familyframe/.MainActivity
```

Check afterwards that `shared_prefs/kiosk.xml` holds the plain address with no key (or doesn't
exist, when you rely on the baked-in default). If the frame ever loses power its clock resets
(no battery), and the kiosk shows "Setting the clock…" until network time syncs.

## Notes from setting up a frame

Written down from a Runxion 10.1" (Frameo, RK3326, Android 8.1) so the next one is quicker.

- **Power and data.** A computer's USB port cannot power a 10.1" frame; use its own adapter. If
  the frame has one port for both, put a **powered USB hub** between it and the computer.
- **ADB.** In Frameo: Settings > About > Beta Program (on) > ADB access (on). The Mac only sees
  a Rockchip device (USB vendor `2207`) once the cable carries data. Accept the "Allow USB
  debugging" prompt on the frame. `su 0 <cmd>` gives root without a prompt.
- **WebView is the first thing to check.** This frame shipped WebView **61**; the dashboard is
  built for Chromium **106** and failed with `Uncaught SyntaxError: Unexpected token =`, leaving a
  blank page behind the static sidebar. Replacing `/system/app/webview/webview.apk` with a pinned
  106 build (and extracting its `lib/arm/*.so`) fixed it. Keep the original as `webview.apk.bak`.
- **Vendor software.** Check `pm list packages -f` and open connections (`netstat -tnp`) before
  joining Wi-Fi. Frameo's updater (`com.adups.fota`) and `RKUpdateService` were disabled with
  `pm disable-user`; Frameo itself was disabled once the kiosk became HOME. Disabling is
  reversible; a factory reset re-enables everything.
- **Stay offline until you have looked.** Other frames in this family ship a hidden root program
  that connects to a remote server. Skip Wi-Fi in first-run setup and inspect first.

## Privacy

- No names, calendar links or keys are committed. Secrets live in Cloudflare; local copies, if
  any, go in `.secrets/`, which is git-ignored.
- Commit with a GitHub `noreply` address, not a personal one.
- The whole site, including the static files, is behind the access key.

## Credits and license

Dashboard UI and the Android kiosk come from
[Wes Bos's photo-frame-dashboard](https://github.com/wesbos/photo-frame-dashboard). MIT licensed;
the original notice is kept in [`LICENSE`](LICENSE).
