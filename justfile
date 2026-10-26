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
    tofu apply --auto-approve

# ---------------------------------------------------------------- kiosk (Android app, see kiosk/README.md)

# Builds kiosk/build/familyframe.apk. Pass url=https://your-worker.workers.dev/ to bake in a default URL
[working-directory('kiosk')]
kiosk-build url=env('KIOSK_URL', ''):
    KIOSK_URL={{ url }} bash build.sh

[working-directory('kiosk')]
kiosk-install:
    adb install -r build/familyframe.apk

# Signs the frame in: opens the key link once so the Worker sets its cookie. The key is not saved on the frame.
kiosk-signin url=env('KIOSK_URL') key=env('ACCESS_KEY'):
    adb shell am start -a android.intent.action.VIEW -d '{{ url }}?key={{ key }}' -n app.familyframe/.MainActivity

# ---------------------------------------------------------------- photos

# Uploads a folder of photos (e.g. downloaded from Google Photos) to R2, named from their EXIF date. Needs exiftool.
photos-upload folder place='':
    bash scripts/upload-photos.sh {{ folder }} {{ place }}
