output "project_id" {
  description = "Read by the release workflow to link the Vercel CLI to the project."
  value       = vercel_project.tradeback.id
}
