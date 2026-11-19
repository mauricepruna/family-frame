# Doorbell → frame: where we stopped and what to do next

## Current state

Everything now runs on the **Raspberry Pi 4** (`doorbell-pi.local`, user `admin`). The Mac is stopped on purpose.

| Piece | State |
| --- | --- |
| Pi power | Fixed (official 5 V / 3 A supply). `vcgencmd get_throttled` = `0x0` |
| Pi services | `docker` (eufy-security-ws), `doorbell-bridge`, `doorbell-tunnel` all start on boot (reboot test passed) |
| Eufy login on the Pi | Done, trusted, survives reboot with no 2FA (volume `bridge/eufy-data`) |
| Worker + overlay | Deployed. A real doorbell press shows the overlay on the frame |
| Public stream | `https://<tunnel-hostname>/stream.mjpeg?t=<STREAM_TOKEN>` works when pulled with `curl` (about 2 MB in 20 s), CPU about 18 % |
| Mac | launchd agents unloaded, Eufy container **stopped, not deleted** (rollback copy). Plists still in `~/Library/LaunchAgents/` |

## The one open problem

**On a real ring, the overlay appears but the video is black.** Same doorbell, same code, and on the **Mac the ring
did show video**. Pulling the stream with `curl` on the Pi works, so the Pi can get video; only the ring-time start fails.

Evidence from the Pi (eufy-security-ws log, around a ring): the bridge starts the livestream, then 5 to 12 seconds later:
`Stopping the station stream for the device ..., because we haven't received any data for 5 seconds`.
So the camera accepts the request but sends no data. A retry loop (re-request every 4 s while there is no video) was
added and did not change the result. Diagnostic logging was added afterwards; it has **not yet been read after a press**.

A theory that "the phone app takes the doorbell's single stream slot" is **weakened**, because the Mac ring worked
with the same phone. Treat it as unproven.

## Hypotheses, most likely first

1. **Docker bridge networking on the Pi** breaks the P2P data path. The Mac ran Docker inside Docker Desktop's VM;
   the Pi runs it natively. Linux supports `network_mode: host`, which removes NAT from the picture.
2. **Session age / warm-up.** The Pi's Eufy session was young at the first ring.
3. **Phone app competing** for the doorbell's stream at ring time (weakened, see above).
4. **Ring-time wake-up race** that is not specific to the Pi (one try per machine is thin evidence).

## Plan for tomorrow, cheapest and most informative first

1. **Baseline press with the new logging** (nothing else changed). Read:
   `ssh admin@doorbell-pi.local 'journalctl -u doorbell-bridge --since "-5min" --no-pager'`
   and the eufy-ws log (`sudo docker compose -f ~/family-frame/bridge/docker-compose.yml logs --since 5m`).
   Look for: `start requested`, `no video yet, retrying` (how many), `first video data after N ms` (or its absence).
2. **Try host networking on the Pi only** (about 2 minutes). In the Pi's `bridge/docker-compose.yml`, replace the
   `ports:` line with `network_mode: host`, then `sudo docker compose up -d` (the volume keeps the login, so no 2FA).
   Press the bell again. Do not commit this change to the shared compose file until it is proven, because
   host networking does not work on macOS Docker Desktop.
3. **Airplane-mode test**: phone in airplane mode (or the Eufy app fully closed, notifications off), press the bell.
   Tells us whether the phone app is involved.
4. **Mac A/B test** if 2 and 3 do not explain it: stop the Pi's `doorbell-bridge`, `doorbell-tunnel` and Eufy container;
   on the Mac, `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/app.familyframe.doorbell-*.plist` and
   `docker compose start` in `bridge/`; press the bell. If the Mac works and the Pi does not, the cause is the Pi's
   environment (network path), not the doorbell. Then stop the Mac and go back to the Pi.
5. **If it is a wake-up race:** delay the first `start_livestream` by 2 to 3 seconds after the ring, and/or keep a
   warm session (start the stream briefly every few minutes) so the camera is already awake at ring time.

## Smaller things to do while there

- The overlay shows plain black while connecting; add a "connecting..." state and an error message if no frame arrives
  within 10 seconds (`dashboard/js/doorbell.js`).
- `bridge/README.md` and `docs/raspberry-pi-migration.md` say `node --test .`; on Node 24 it must be `node --test`.
- The `bropat/eufy-security-ws:latest` image tag should be pinned once the working version is known.
- After one stable week on the Pi: remove the Mac's launch agents and tunnel credentials, delete its stopped Eufy
  container, and consider rotating `DOORBELL_TOKEN` and `STREAM_TOKEN`.

## Rollback (if the Pi becomes unusable)

Stop `doorbell-bridge`, `doorbell-tunnel` and the Eufy container on the Pi first (never run both machines), then on the
Mac bootstrap the two launch agents and `docker compose start` in `bridge/`. No 2FA is needed, the saved login is in the
stopped container.

## Uncommitted work

Nothing is committed (the user handles commits). Changed or new files: `worker/doorbell.js` (+ test), `worker/index.js`,
`dashboard/js/doorbell.js`, `dashboard/css/views/doorbell.css`, `dashboard/index.html`, `dashboard/js/main.js`, the whole
`bridge/` folder, `.gitignore`, `docs/`.
