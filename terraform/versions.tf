terraform {
  required_version = ">= 1.6.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

# Auth comes from the CLOUDFLARE_API_TOKEN env var (see README.md) — never put a token in this repo.
provider "cloudflare" {}
