output "worker_url" {
  description = "Open this once with ?key=<access_key> appended to sign in; the Worker sets a cookie after that."
  value       = "https://${cloudflare_workers_script.family_frame.script_name}.${var.workers_dev_subdomain}.workers.dev/"
}
