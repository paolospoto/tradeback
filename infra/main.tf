# No git_repository: deployments are created by the Vercel CLI in the release workflow.
resource "vercel_project" "tradeback" {
  name         = "tradeback"
  framework    = "nextjs"
  node_version = "22.x"

  # Only releases deploy, always to production.
  preview_deployments_disabled = true

  # Without this the project inherits the account's deployment protection.
  vercel_authentication = {
    deployment_type = "none"
  }

  lifecycle {
    prevent_destroy = true
  }
}
