#!/usr/bin/env bash
# One-time setup for the Infra and Deploy workflows:
# - creates the HCP Terraform workspace in local execution mode (HCP only keeps the state);
# - creates the GitHub "production" environment, usable only from main and v* tags;
# - stores the HCP and Vercel tokens as secrets of that environment and the HCP organization as a variable.
# Requires curl and an authenticated gh. Safe to run again, for example to rotate a token.
set -euo pipefail

REPO="${REPO:-paolospoto/tradeback}"
WORKSPACE="tradeback-production"
HCP_API="https://app.terraform.io/api/v2"

gh auth status >/dev/null 2>&1 || { echo "gh is not logged in: run 'gh auth login' first." >&2; exit 1; }

read -r -p "HCP Terraform organization: " org
read -r -s -p "HCP Terraform API token: " tf_token && echo
read -r -s -p "Vercel token: " vercel_token && echo

hcp() {
  curl -sS -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $tf_token" -H "Content-Type: application/vnd.api+json" "$@"
}

echo "Checking the Vercel token"
status=$(curl -sS -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $vercel_token" https://api.vercel.com/v2/user)
[[ "$status" == 200 ]] || { echo "Vercel rejected the token (HTTP $status)." >&2; exit 1; }

echo "HCP workspace $org/$WORKSPACE (local execution)"
body=$(printf '{"data":{"type":"workspaces","attributes":{"name":"%s","execution-mode":"local","setting-overwrites":{"execution-mode":true}}}}' "$WORKSPACE")
status=$(hcp "$HCP_API/organizations/$org/workspaces/$WORKSPACE")
case "$status" in
  200) status=$(hcp -X PATCH --data "$body" "$HCP_API/organizations/$org/workspaces/$WORKSPACE") ;;
  404) status=$(hcp -X POST --data "$body" "$HCP_API/organizations/$org/workspaces") ;;
esac
[[ "$status" =~ ^20[01]$ ]] || { echo "HCP Terraform answered HTTP $status: check the organization and the token." >&2; exit 1; }

echo "GitHub environment production"
gh api --silent -X PUT "repos/$REPO/environments/production" --input - <<'EOF'
{ "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true } }
EOF
policies=$(gh api "repos/$REPO/environments/production/deployment-branch-policies" --jq '.branch_policies[] | "\(.type):\(.name)"')
for policy in branch:main tag:v*; do
  if ! grep -qxF "$policy" <<<"$policies"; then
    gh api --silent -X POST "repos/$REPO/environments/production/deployment-branch-policies" \
      -f type="${policy%%:*}" -f name="${policy#*:}"
  fi
done

echo "Secrets and variables"
printf '%s' "$tf_token" | gh secret set TF_API_TOKEN --env production --repo "$REPO"
printf '%s' "$vercel_token" | gh secret set VERCEL_TOKEN --env production --repo "$REPO"
gh variable set HCP_ORGANIZATION --repo "$REPO" --body "$org"

echo "Done. Merging a change to infra/ into main now creates the Vercel project."
