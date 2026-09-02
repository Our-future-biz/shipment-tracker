#!/usr/bin/env bash
# Local dev runner for shipment-tracker (Encore API + Next.js web).
#
#   ./run-local.sh          spusti aplikaci (web :3001, API :4001)
#   ./run-local.sh stav     ukaze co bezi a co ne
#   ./run-local.sh seed     naplni ukazkova data (druhe okno, kdyz aplikace bezi)
#   ./run-local.sh admin <email> <heslo> ["Jmeno"]   vytvori superadmina
#
#   Zaloha dat:  ./zaloha.sh   (viz ./zaloha.sh seznam)
#
set -euo pipefail
cd "$(dirname "$0")"

need() { command -v "$1" >/dev/null 2>&1 || { echo "❌ missing: $1 — $2"; exit 1; }; }

cmd="${1:-dev}"

if [ "$cmd" = "dev" ]; then
  need encore "brew install encoredev/tap/encore"
  need docker "install Docker Desktop: brew install --cask docker"

  # Docker Desktop nebezi? Spustime ho a pockame, misto abychom skoncili chybou.
  if ! docker info >/dev/null 2>&1; then
    echo "→ Docker Desktop nebezi, spoustim ho…"
    open -a Docker 2>/dev/null || true
    printf "   cekam na Docker "
    for i in $(seq 1 60); do
      if docker info >/dev/null 2>&1; then echo " OK"; break; fi
      printf "."; sleep 2
    done
    if ! docker info >/dev/null 2>&1; then
      echo ""
      echo "❌ Docker se nerozjel do 2 minut. Spust Docker Desktop rucne a zkus znovu."
      exit 1
    fi
  fi

  command -v pnpm >/dev/null 2>&1 || { echo "→ zapinam pnpm pres corepack"; corepack enable; corepack prepare pnpm@10.28.1 --activate; }

  # Zbytek po predchozim behu drzi porty. Uvolnime je, jinak start selze.
  for port in 3001 4001; do
    pid=$(lsof -ti tcp:$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
      echo "→ port $port drzi stary proces ($pid), ukoncuji"
      kill $pid 2>/dev/null || true
      sleep 1
      still=$(lsof -ti tcp:$port 2>/dev/null || true)
      [ -n "$still" ] && kill -9 $still 2>/dev/null || true
    fi
  done

  echo "→ instaluji zavislosti"
  pnpm install

  if [ ! -f apps/api/.secrets.local.cue ]; then
    echo "→ chybi apps/api/.secrets.local.cue, vytvarim vychozi"
    printf '%s\n' \
      '// Local-only secret overrides. Never committed.' \
      'JWT_SECRET: "local-dev-jwt-secret-not-for-production"' \
      'ANTHROPIC_API_KEY: "sk-local-placeholder-set-a-real-key-to-use-doc-extraction"' \
      > apps/api/.secrets.local.cue
  fi

  echo ""
  echo "────────────────────────────────────────────────────────"
  echo " Aplikace startuje. Toto okno nechej OTEVRENE."
  echo " Az bude hotovo, otevri:  http://localhost:3001"
  echo " Vypnout:  Ctrl+C  (nebo zavreni okna)"
  echo " Data se zalohuji automaticky (1x denne, po nabehnuti API)."
  echo "────────────────────────────────────────────────────────"
  echo ""
  # Automaticka zaloha dat: pocka, az API nabehne, a zalohuje na pozadi.
  # Preskoci se, pokud uz dnes zaloha existuje (staci jedna denne).
  (
    DNES=$(date +%Y-%m-%d)
    KAM="$HOME/Documents/Shipment Tracker/zalohy"
    if ls -d "$KAM/${DNES}"_* >/dev/null 2>&1; then
      exit 0   # dnes uz zalohovano
    fi
    for i in $(seq 1 60); do
      if curl -s -o /dev/null -m 2 http://localhost:4001/auth/me 2>/dev/null; then
        sleep 3
        ./zaloha.sh >/tmp/shipment-zaloha.log 2>&1
        if grep -q "Hotovo:" /tmp/shipment-zaloha.log; then
          echo ""
          echo "💾 Automaticka zaloha dat hotova ($(grep -o 'Hotovo: [0-9]* z [0-9]*' /tmp/shipment-zaloha.log))"
        fi
        exit 0
      fi
      sleep 2
    done
  ) &

  exec pnpm dev
fi

if [ "$cmd" = "stav" ] || [ "$cmd" = "status" ]; then
  echo "Docker Desktop:"
  if docker info >/dev/null 2>&1; then echo "  ✅ bezi"; else echo "  ❌ nebezi  →  open -a Docker"; fi
  echo "Aplikace:"
  for port in 3001 4001; do
    what=$([ "$port" = "3001" ] && echo "web  " || echo "API  ")
    if lsof -ti tcp:$port >/dev/null 2>&1; then
      echo "  ✅ $what na portu $port bezi"
    else
      echo "  ❌ $what na portu $port nebezi"
    fi
  done
  echo ""
  echo "Kdyz neco chybi:  ./run-local.sh"
  exit 0
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
