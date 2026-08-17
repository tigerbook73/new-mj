#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../../.." && pwd)"

cd "$REPO_ROOT"

echo "[1/4] Preparing local nickname-login configuration"
if [[ -e .env.development.local ]]; then
  echo "Keeping existing .env.development.local"
else
  cp docs/onboarding/templates/env.development.local .env.development.local
  echo "Created .env.development.local (database and Supabase disabled)"
fi

echo "[2/4] Checking WSL development prerequisites"
bash docs/onboarding/scripts/doctor-wsl.sh --bootstrap

echo "[3/4] Installing dependencies from pnpm-lock.yaml"
pnpm install --frozen-lockfile

echo "[4/4] Building all workspaces"
pnpm build

echo
echo "bootstrap complete"
echo "Next: pnpm dev"
echo "Then: bash docs/onboarding/scripts/doctor-wsl.sh --running"
