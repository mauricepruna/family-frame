set shell := ["bash", "-euo", "pipefail", "-c"]
# Loads .env (repo root, git-ignored) into every recipe's environment — see .env.example
set dotenv-load

# List available recipes
default:
    @just --list

# ---------------------------------------------------------------- dashboard (web UI + Worker)

[working-directory('dashboard')]
dashboard-install:
    npm install

# Runs the dashboard locally with Vite (http://localhost:5173)
[working-directory('dashboard')]
dashboard-dev: dashboard-install
    npm run dev

[working-directory('dashboard')]
dashboard-build: dashboard-install
    npm run build

# Builds and deploys the Worker + dashboard via wrangler (needs `wrangler login` once; see README.md)
[working-directory('dashboard')]
dashboard-deploy: dashboard-install
    npm run deploy

# ---------------------------------------------------------------- worker (Cloudflare Worker source)

[working-directory('worker')]
worker-install:
    npm install

[working-directory('worker')]
worker-test: worker-install
    npm test

# Bundles worker/index.js into worker/dist/index.js (esbuild) — used by terraform/, not by dashboard-deploy
[working-directory('worker')]
worker-build: worker-install
    npm run build

# Runs the worker test suite
test: worker-test

# Builds everything terraform/ needs to upload (worker bundle + dashboard assets)
build: worker-build dashboard-build

# ---------------------------------------------------------------- terraform/opentofu (see terraform/README.md)

# Needs backend.hcl first (see terraform/README.md's "Remote state" section)
[working-directory('terraform')]
tf-init:
    tofu init -backend-config=backend.hcl

[working-directory('terraform')]
tf-fmt:
    tofu fmt

[working-directory('terraform')]
tf-validate:
    tofu validate

[working-directory('terraform')]
tf-plan: build
    tofu plan

[working-directory('terraform')]
tf-apply: build
    tofu apply

# ---------------------------------------------------------------- kiosk (Android app, see kiosk/README.md)

# Builds kiosk/build/homehq.apk. Pass url=https://your-worker.workers.dev/ to bake in a default URL
[working-directory('kiosk')]
kiosk-build url='':
    KIOSK_URL={{ url }} bash build.sh

[working-directory('kiosk')]
kiosk-install:
    adb install -r build/homehq.apk
