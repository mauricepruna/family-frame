# Doorbell bridge (wired Eufy doorbell, e.g. T8210)

Wired Eufy doorbells have no RTSP, so the bridge uses the P2P livestream. Run it on an always-on
machine at home (Docker, Node 22+, ffmpeg).

1. `EUFY_USER=... EUFY_PASS=... docker compose up -d` (use a secondary Eufy account; a second login on
   your main one can sign out the phone app). Check the logs for your doorbell's serial (T8210...).
   Caveat: `bropat/eufy-security-ws` is archived and Eufy is deprecating legacy APIs; if it will not
   connect, that is the first suspect.
2. Pick two random secrets: `openssl rand -hex 24` (DOORBELL_TOKEN) and again (STREAM_TOKEN).
3. `WORKER_URL=https://<worker> DOORBELL_TOKEN=... STREAM_TOKEN=... DOORBELL_SERIAL=T8210... node ring-forwarder.mjs`
4. Tunnel port 8554 (`cloudflared tunnel --url http://localhost:8554`).
5. From `dashboard/`:
   `npx wrangler secret put DOORBELL_TOKEN` and
   `npx wrangler secret put DOORBELL_STREAM_URL` (value: `https://<tunnel>/stream.mjpeg?t=<STREAM_TOKEN>`),
   then `npm run deploy`.
6. Ring the bell. The frame polls every 3 s, so the overlay appears within a few seconds and closes
   after 60 s or on tap.

Tests: `node --test` in `bridge/` and `npm test` in `worker/`.
