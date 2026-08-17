#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../../.." && pwd)"
CHECK_RUNNING=false
CHECK_SUPABASE=false
BOOTSTRAP_MODE=false
FAILURES=0

usage() {
  cat <<'EOF'
Usage: bash docs/onboarding/scripts/doctor-wsl.sh [options]

Options:
  --bootstrap   Check only prerequisites required by bootstrap-wsl.sh
  --running     Also check the default Web and Server URLs
  --supabase    Also require Docker and check local Supabase (implies --running)
  -h, --help    Show this help
EOF
}

pass() {
  printf 'PASS  %s\n' "$1"
}

warn() {
  printf 'WARN  %s\n' "$1"
}

fail() {
  printf 'FAIL  %s\n' "$1"
  FAILURES=$((FAILURES + 1))
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

while (($# > 0)); do
  case "$1" in
    --bootstrap) BOOTSTRAP_MODE=true ;;
    --running) CHECK_RUNNING=true ;;
    --supabase)
      CHECK_SUPABASE=true
      CHECK_RUNNING=true
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      printf 'error: unknown option: %s\n\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

cd "$REPO_ROOT"

printf 'new-mj doctor (%s)\n\n' "$REPO_ROOT"

if grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null; then
  pass "running inside WSL"
else
  fail "not running inside WSL; open the repository with VS Code's WSL extension"
fi

if command_exists git; then
  pass "git available ($(git --version))"
else
  fail "git missing"
fi

if command_exists node; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
  if [[ "$NODE_MAJOR" == "24" ]]; then
    pass "Node $(node --version) matches .nvmrc"
  else
    fail "Node $(node --version 2>/dev/null || printf unknown) does not match required major 24"
  fi
else
  fail "node missing; install and select Node 24 with nvm"
fi

if command_exists pnpm; then
  PNPM_VERSION="$(pnpm --version 2>/dev/null || true)"
  if [[ "$PNPM_VERSION" == "10.33.3" ]]; then
    pass "pnpm $PNPM_VERSION matches packageManager"
  else
    fail "pnpm ${PNPM_VERSION:-unknown} does not match required 10.33.3"
  fi
else
  fail "pnpm missing; enable Corepack and activate pnpm 10.33.3"
fi

if [[ -f package.json && -f pnpm-lock.yaml && -f pnpm-workspace.yaml ]]; then
  pass "repository root detected"
else
  fail "repository root is incomplete"
fi

if [[ "$BOOTSTRAP_MODE" == false ]]; then
  if [[ -d node_modules ]]; then
    pass "dependencies installed"
  else
    fail "node_modules missing; run bootstrap-wsl.sh"
  fi

  if [[ -d packages/core/dist && -d packages/protocol/dist && -d packages/ai/dist ]]; then
    pass "shared workspace build output present"
  else
    warn "one or more shared package dist directories are missing; run pnpm build"
  fi
fi

if command_exists docker && docker info >/dev/null 2>&1; then
  pass "Docker daemon reachable from WSL"
else
  if [[ "$CHECK_SUPABASE" == true ]]; then
    fail "Docker daemon unavailable; enable Docker Desktop WSL Integration"
  else
    warn "Docker unavailable; nickname login works, Supabase does not"
  fi
fi

if [[ "$CHECK_RUNNING" == true ]]; then
  if ! command_exists curl; then
    fail "curl missing; cannot check running services"
  else
    if curl --fail --silent --show-error --max-time 3 http://localhost:5173/ >/dev/null; then
      pass "Web reachable at http://localhost:5173"
    else
      fail "Web not reachable at http://localhost:5173"
    fi

    HEALTH_RESPONSE="$(curl --silent --show-error --max-time 3 http://localhost:3000/health 2>/dev/null || true)"
    if [[ -z "$HEALTH_RESPONSE" ]]; then
      fail "Server health endpoint not reachable at http://localhost:3000/health"
    elif [[ "$HEALTH_RESPONSE" == *'"ok":true'* ]]; then
      pass "Server reachable and database healthy"
    else
      warn "Server reachable; database is not configured or not healthy"
    fi
  fi
fi

if [[ "$CHECK_SUPABASE" == true ]]; then
  if [[ ! -f supabase/.env ]]; then
    fail "supabase/.env missing; copy it from supabase/.env.example"
  else
    pass "supabase/.env present and ignored by Git"
  fi

  if pnpm exec supabase status >/dev/null 2>&1; then
    pass "local Supabase is running"
  else
    fail "local Supabase is not running for this project"
  fi
fi

printf '\n'
if ((FAILURES > 0)); then
  printf 'doctor found %d failure(s)\n' "$FAILURES"
  exit 1
fi

printf 'doctor passed\n'
