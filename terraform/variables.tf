variable "cloudflare_account_id" {
  description = "Cloudflare account ID to deploy into (Dashboard > Workers & Pages > Overview, right sidebar)."
  type        = string
}

variable "workers_dev_subdomain" {
  description = "The account's workers.dev subdomain name (Dashboard > Workers & Pages > set up once per account). Used only to print the site URL."
  type        = string
}

variable "worker_name" {
  description = "Name of the Worker (and its URL: <worker_name>.<workers_dev_subdomain>.workers.dev)."
  type        = string
  default     = "family-frame"
}

variable "compatibility_date" {
  description = "Workers runtime compatibility date. Keep in sync with dashboard/wrangler.jsonc."
  type        = string
  default     = "2026-09-30"
}

variable "access_key" {
  description = "Long random string required (as ?key=) to sign in. Generate with: openssl rand -hex 24"
  type        = string
  sensitive   = true
}

variable "calendar_ics_url" {
  description = "Private iCal URL for the family calendar (Google Calendar > Settings > Integrate calendar > Secret address in iCal format). Treat as a password."
  type        = string
  sensitive   = true
}

variable "family_json" {
  description = <<-EOT
    JSON array naming the family, e.g.:
    [{"id":"p1","name":"Ana","match":["ana"]},{"id":"p2","name":"Ben","initial":"Be","match":["ben","benjamin"]}]
    id must be p1..p4. See the root README for details.
  EOT
  type        = string
  sensitive   = true
}

variable "home_latlon" {
  description = "\"lat,lon\" of your town, to town-centre precision (two decimals), e.g. 40.71,-74.01."
  type        = string
  sensitive   = true
}
