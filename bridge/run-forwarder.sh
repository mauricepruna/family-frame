#!/bin/sh
# Entry point for launchd (macOS) and systemd (Linux): loads bridge/.env (git-ignored) and runs the forwarder.
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" # service managers start with a minimal PATH
set -a; . ./.env; set +a
export EUFY_WS="${EUFY_WS:-ws://localhost:3000}"
exec node ring-forwarder.mjs
