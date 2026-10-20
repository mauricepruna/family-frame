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

## Use

```sh
cp terraform.tfvars.example terraform.tfvars   # fill in; this file is git-ignored
tofu init
tofu plan
tofu apply
```

`terraform.tfvars` holds the access key, calendar URL, family JSON and lat/lon — all secrets.
Keep it out of the repo (already git-ignored) or skip the file entirely and pass each as a
`TF_VAR_<name>` environment variable instead.

State is local (`terraform.tfstate`, git-ignored) by default, which is fine for a single person
running this from one machine. If more than one of you will run `tofu apply`, add a `backend`
block to `versions.tf` (e.g. an R2 bucket with the S3-compatible backend) so you share one state
file instead of overwriting each other's.

`tofu apply` prints `worker_url`. Open it once with `?key=<access_key>` appended to sign in, same
as the wrangler flow — see "Signing in" in the root README.

## What this does not cover

- Registering the account's workers.dev subdomain name (one-time, dashboard-only).
- The kiosk Android app — it's a local build (`kiosk/build.sh`), not a Cloudflare resource.
- Anything not yet real: photos, chores, shopping, home are still demo data (see root README).
