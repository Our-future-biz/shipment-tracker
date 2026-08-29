#!/usr/bin/env bash
# Local dev runner for shipment-tracker (Encore API + Next.js web).
#
#   ./run-local.sh          setup + start API (:4001) and web (:3001)
#   ./run-local.sh seed     seed demo data (run in a 2nd terminal while dev is up)
#   ./run-local.sh admin <email> <password> ["Name"]   create a superadmin
#
set -euo pipefail
cd "$(dirname "$0")"

need() { command -v "$1" >/dev/null 2>&1 || { echo "❌ missing: $1 — $2"; exit 1; }; }

cmd="${1:-dev}"

if [ "$cmd" = "dev" ]; then
  need docker "install Docker Desktop and start it (Encore provisions Postgres in Docker)"
  docker info >/dev/null 2>&1 || { echo "❌ Docker is installed but not running — start Docker Desktop."; exit 1; }
  need encore "brew install encoredev/tap/encore"
  command -v pnpm >/dev/null 2>&1 || { echo "→ enabling pnpm via corepack"; corepack enable; corepack prepare pnpm@10.28.1 --activate; }

  echo "→ installing dependencies"
  pnpm install

  if [ ! -f apps/api/.secrets.local.cue ]; then
    echo "❌ apps/api/.secrets.local.cue is missing — local secrets live there. Recreate it with:"
    echo '   printf %s\\n "JWT_SECRET: \"local-dev-jwt-secret\"" "ANTHROPIC_API_KEY: \"sk-placeholder\"" > apps/api/.secrets.local.cue'
    exit 1
  fi
  echo "ℹ️  This app runs unlinked from Encore Cloud; secrets come from apps/api/.secrets.local.cue"

  echo "→ starting API on :4001 and web on :3001  (Ctrl-C to stop)"
  echo "   app:  http://localhost:3001     Encore dashboard: http://localhost:9400"
  exec pnpm dev
fi

# Steps below need `encore run` to be up so the DB URIs resolve.
AUTH_DB_URL="$(cd apps/api && encore db conn-uri auth)"
export AUTH_DB_URL

case "$cmd" in
  seed)
    SHIPMENTS_DB_URL="$(cd apps/api && encore db conn-uri shipments)"
    export SHIPMENTS_DB_URL
    pnpm --filter api db:seed
    ;;
  admin)
    shift
    [ $# -ge 2 ] || { echo "usage: ./run-local.sh admin <email> <password> [\"Name\"]"; exit 1; }
    (cd apps/api && pnpm exec tsx scripts/provision-superadmin.ts "$@")
    ;;
  *)
    echo "usage: ./run-local.sh [dev|seed|admin]"; exit 1;;
esac
