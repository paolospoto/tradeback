terraform {
  required_version = ">= 1.14"

  # The organization comes from TF_CLOUD_ORGANIZATION. The workspace runs in local
  # execution mode: HCP Terraform only stores and locks the state.
  cloud {
    workspaces {
      name = "tradeback-production"
    }
  }

  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 5.27"
    }
  }
}

# Authenticates with VERCEL_API_TOKEN; no team, so resources go to the token's personal account.
provider "vercel" {}
