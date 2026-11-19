# Moving the doorbell bridge from a Mac to a Raspberry Pi

Goal: the doorbell → frame path keeps working with no Mac involved, and survives power cuts and reboots
without anyone opening a terminal.

## What moves, what stays

| Piece | Where it runs today | After |
| --- | --- | --- |
| `eufy-security-ws` (Docker) | Mac | **Pi** |
| `ring-forwarder.mjs` + ffmpeg | Mac (launchd) | **Pi** (systemd) |
| `cloudflared` named tunnel | Mac (launchd) | **Pi** (systemd) |
| Worker, dashboard, frame | Cloudflare / frame | unchanged |
| Worker secrets, tunnel hostname | Cloudflare | **unchanged** — no redeploy |

Because the tunnel hostname and both Worker secrets stay the same, the cutover is "stop on the Mac, start on the Pi".

## 0. Before buying: the one real risk

The bridge decodes the doorbell's H.264 (2K) in software with ffmpeg and re-encodes it as MJPEG.

- **Pi 4 (2 GB+)** — the target for this setup. Unproven for a 2K stream, so measure CPU during step 5; if it
  sits above ~80 %, lower the cost in `ring-forwarder.mjs` (`fps=8` → `fps=5`, `scale=-2:480` → `-2:360`).
  Do not count on the Pi 4's hardware H.264 decoder: it is specified for 1080p, and the doorbell is 2K.
  Software decode is the expectation.
- **Pi 5 (4 GB)** — the fallback if the Pi 4 cannot keep up. More CPU headroom, no hardware H.264 decode.
- **Pi 1 / Zero / any 32-bit ARMv6 board — not suitable.** Single slow core, 512 MB RAM, no 64-bit OS, no current
  Node or Docker images.
- Wired Ethernet, not Wi-Fi (the P2P connection should be on the same LAN as the doorbell's station).
- Good SD card (A2) or a small USB SSD; a power supply that matches the model.

## 1. Prepare the Pi

1. Flash **Raspberry Pi OS Lite (64-bit)** with Raspberry Pi Imager. Set hostname, user, SSH key, Ethernet.
2. Give it a **fixed LAN address** (DHCP reservation on the router).
3. `sudo apt update && sudo apt full-upgrade -y`
4. Install: `ffmpeg`, `git`, Docker (`curl -fsSL https://get.docker.com | sh`, add the user to the `docker` group),
   **Node 22+** (NodeSource or `nvm`; Raspberry Pi OS's apt Node is too old), and `cloudflared`
   (arm64 `.deb` from Cloudflare's releases).
5. Clone this repo to the Pi.

## 2. Make the Eufy session survive recreation (set this up on the Pi from day one)

`bridge/docker-compose.yml` currently has **no volume**, so the container's saved login lives only inside the
container. Recreate it and Eufy asks for 2FA again. Add a volume for the server's data directory
(check the image docs for the exact path; it is `/data` in the upstream image) and keep it out of git.

**Do not apply this to the running Mac container:** adding a volume means `docker compose up -d` recreates the
container, which throws away the saved login and costs two more 2FA codes. Edit the file in the repo, and let the
Pi start with the volume already in place:

```yaml
    volumes: ["./eufy-data:/data"]
```

Add `bridge/eufy-data/` to `.gitignore`.

## 3. Copy configuration (never through git or chat)

From the Mac, with `scp`:

- `bridge/.env` → Pi `bridge/.env` (Eufy login, `DOORBELL_TOKEN`, `STREAM_TOKEN`, `DOORBELL_SERIAL`, `WORKER_URL`)
- `~/.cloudflared/<tunnel-id>.json` and `~/.cloudflared/doorbell.yml` → Pi `~/.cloudflared/`
  (fix the `credentials-file:` path inside `doorbell.yml` to the Pi user's home)

Do **not** copy `cert.pem`; it is only needed to create tunnels, not to run one.

## 4. systemd instead of launchd

Three units, all `Restart=always`, `WantedBy=multi-user.target`:

1. `doorbell-eufy.service` — `docker compose up` in `bridge/` (or rely on `restart: unless-stopped` and enable `docker`).
2. `doorbell-bridge.service` — `ExecStart=/path/to/bridge/run-forwarder.sh`, `After=doorbell-eufy.service`.
   (`run-forwarder.sh` already sets a safe `PATH` and loads `.env`; change its hard-coded `/opt/homebrew/bin` paths to
   `/usr/bin` for Linux, or make it use `command -v node`.)
3. `doorbell-tunnel.service` — `cloudflared tunnel --no-autoupdate --config ~/.cloudflared/doorbell.yml run family-frame-doorbell`.

Enable with `sudo systemctl enable --now <unit>`.

## 5. Cutover (about 15 minutes, doorbell offline during it)

Do not run both machines at once: two connectors on one tunnel would split traffic, and two bridges would both
start livestreams.

1. **Mac:** stop and unload the agents:
   `launchctl bootout gui/$(id -u)/app.familyframe.doorbell-bridge` and `...doorbell-tunnel`; `docker compose down`.
2. **Pi:** `docker compose up -d` in `bridge/`.
3. **Pi:** Eufy will ask for 2FA from the new device. Run `node verify-code.mjs <code>` — expect **two** emails/codes
   (the new API, then the older one), exactly as on the Mac. Use the newest code each time.
4. **Pi:** start the other two units. Confirm the tunnel shows a connector from the Pi:
   `cloudflared tunnel info family-frame-doorbell`.
5. Verify (below).

## 6. Verification checklist

- [ ] `curl` the public stream with the right token → hundreds of KB of JPEG; with a wrong token → 401.
- [ ] CPU on the Pi while streaming stays comfortably below 80 % (`top`).
- [ ] **Real doorbell press** → overlay on the frame within a few seconds; Eufy app shows the ring too.
- [ ] `sudo reboot` → everything comes back without touching it; a ring still works.
- [ ] Pull the power, plug it back in → same.
- [ ] After 24 hours: no 2FA prompts, no crash loops (`journalctl -u doorbell-bridge`).

## 7. Rollback

If anything fails before step 6 is green: stop the Pi units, then on the Mac
`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/app.familyframe.doorbell-bridge.plist` (and the tunnel
plist) and `docker compose up -d`. Keep the Mac's setup untouched for a week before deleting it.

## 8. Clean up the Mac (after a stable week)

- Remove the two plists from `~/Library/LaunchAgents/`.
- Remove the Mac's copies of `bridge/.env` secrets and the tunnel credentials JSON.
- Consider rotating `DOORBELL_TOKEN` and `STREAM_TOKEN` (new values on the Pi, `wrangler secret put` for the two
  Worker secrets).

## Known caveats

- `bropat/eufy-security-ws` is archived; pin the image tag that works instead of `:latest` once you have one.
- A secondary Eufy account is safer than the main one: a second login on the main account can sign out the phone app.
- If the Pi cannot reach the doorbell's station over the LAN, it will fall back to Eufy's cloud relay, which is
  slower; check the container log for `Connected to station ... on host <LAN ip>`.
