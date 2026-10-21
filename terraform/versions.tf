terraform {
  # >= 1.10 for the s3 backend's use_lockfile (native R2/S3 locking, see backend.hcl.example)
  required_version = ">= 1.10.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # Account-specific settings (bucket, endpoint, ...) come from -backend-config=backend.hcl
  # (git-ignored, see backend.hcl.example and README.md) — never hardcode them here, so this
  # config stays portable to a different account's bucket.
  backend "s3" {}
}

# Auth comes from the CLOUDFLARE_API_TOKEN env var (see README.md) — never put a token in this repo.
provider "cloudflare" {}
