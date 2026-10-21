# Terraform / OpenTofu

Reproduces the Cloudflare side of this project (the Worker, its static assets, and its four
secrets) from scratch in any Cloudflare account, as an alternative to the `wrangler`-based flow
in the root [README](../README.md). Useful for spinning the whole thing up again in a different
account.

This manages the same Worker that `npm run deploy` (wrangler) manages. Use one or the other for a
given account — if you run `wrangler deploy` after this, re-run `tofu apply` afterward (or at
least `tofu plan`) so Terraform's state matches what's actually deployed.

## Prerequisites

- [OpenTofu](https://opentofu.org/docs/intro/install/) (commands below use `tofu`; `terraform` is
  a drop-in alias — same HCL, same provider).
- A [Cloudflare API token](https://dash.cloudflare.com/profile/api-tokens) with *Workers Scripts:
  Edit* for the account you're deploying to. Export it, never write it to a file:
  ```sh
  export CLOUDFLARE_API_TOKEN=...
  ```
- The account's `account_id` and its workers.dev subdomain name, both from
  Dashboard > Workers & Pages > Overview. If the account has never registered a workers.dev
  subdomain, do that once in the dashboard first — Terraform only toggles a Worker onto it, it
  doesn't create the subdomain name itself.
- Built artifacts — Terraform uploads what's already built, it doesn't build anything:
  ```sh
  (cd ../worker && npm install && npm run build)      # -> worker/dist/index.js
  (cd ../dashboard && npm install && npm run build)   # -> dashboard/dist/
  ```

## Remote state (Cloudflare R2)

State lives in an R2 bucket (S3-compatible, free tier covers this easily) instead of a local
file, so it's not sitting unencrypted on one laptop and isn't lost if that laptop is. One-time
setup per account:

```sh
(cd ../dashboard && npx wrangler r2 bucket create tfstate)
```

If wrangler offers to add this bucket as a binding to `dashboard/wrangler.jsonc` (its "automatic
resource provisioning" prompt), decline. This bucket is Terraform's state store only — the Worker
itself has no reason to bind it, and adding it there just creates drift between two unrelated
tools pointed at the same bucket name.

Then create an R2 API token scoped to just that bucket: Dashboard > R2 > Manage API tokens >
Create API token (Object Read & Write, this bucket only). That gives you an Access Key ID and
Secret Access Key — export them, never write them to a file:

```sh
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
```

```sh
cp backend.hcl.example backend.hcl   # fill in the bucket name and account ID; git-ignored
tofu init -backend-config=backend.hcl
```

`backend.hcl` holds no secrets, just where the bucket lives — it's separate from `versions.tf` so
that file doesn't change when you reproduce this in a different account (only `backend.hcl` does).
Locking uses R2's native conditional-write support (`use_lockfile`), so no DynamoDB-equivalent is
needed.

## Use

```sh
cp terraform.tfvars.example terraform.tfvars   # fill in; this file is git-ignored
tofu plan
tofu apply
```

`terraform.tfvars` holds the access key, calendar URL, family JSON and lat/lon — all secrets.
Keep it out of the repo (already git-ignored) or skip the file entirely and pass each as a
`TF_VAR_<name>` environment variable instead.

`tofu apply` prints `worker_url`. Open it once with `?key=<access_key>` appended to sign in, same
as the wrangler flow — see "Signing in" in the root README.

## What this does not cover

- Registering the account's workers.dev subdomain name (one-time, dashboard-only).
- The kiosk Android app — it's a local build (`kiosk/build.sh`), not a Cloudflare resource.
- Anything not yet real: photos, chores, shopping, home are still demo data (see root README).

## Family photos (R2)

`tofu apply` also creates the `family-frame-photos` R2 bucket and binds it to the Worker as
`PHOTOS`. The API token needs *Workers R2 Storage: Edit* in addition to *Workers Scripts: Edit*.

The screensaver, Photos view and home tile show whatever is in that bucket (the demo photos only
appear while it's empty). Name files `YYYY-MM-DD_Place-Name[_p].jpg` — hyphens become spaces in the
caption, `_p` marks a portrait shot, landscape is the default:

```sh
npx wrangler r2 object put family-frame-photos/2024-05-19_Humber-Bay-Park_p.jpg --file ./photo.jpg --remote
```

Photos are served through the Worker (`/photos/<name>`), so they sit behind the same access key —
the bucket itself stays private. Resize to ~1600px wide before uploading; the tablet doesn't need
originals.

### Bulk upload from Google Photos

Select the photos in Google Photos, download them (they arrive as a zip), unzip, then:

```sh
brew install exiftool
just photos-upload ~/Downloads/fam-photos "Lake of Bays"   # place is optional
```

Names come from each photo's EXIF date and orientation (plus a `~HHMMSS` suffix so same-day shots
don't collide). Photos without an EXIF date are skipped and listed.
