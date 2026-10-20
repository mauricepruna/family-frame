locals {
  worker_bundle = "${path.module}/../worker/dist/index.js"
  assets_dir    = "${path.module}/../dashboard/dist"
}

# Built by `npm run build` in worker/ (esbuild) and dashboard/ (vite) — see README.md.
# Terraform/OpenTofu only uploads what's already built; it doesn't run those builds itself.
resource "cloudflare_workers_script" "family_frame" {
  account_id         = var.cloudflare_account_id
  script_name        = var.worker_name
  main_module        = "index.js"
  content_file       = local.worker_bundle
  content_sha256     = filesha256(local.worker_bundle)
  compatibility_date = var.compatibility_date

  assets = {
    directory = local.assets_dir
    config = {
      run_worker_first = true
    }
  }

  bindings = [
    { name = "ASSETS", type = "assets" },
    { name = "ACCESS_KEY", type = "secret_text", text = var.access_key },
    { name = "CALENDAR_ICS_URL", type = "secret_text", text = var.calendar_ics_url },
    { name = "FAMILY_JSON", type = "secret_text", text = var.family_json },
    { name = "HOME_LATLON", type = "secret_text", text = var.home_latlon },
  ]

  observability = {
    enabled = true
  }
}

resource "cloudflare_workers_script_subdomain" "family_frame" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.family_frame.script_name
  enabled     = true
}
