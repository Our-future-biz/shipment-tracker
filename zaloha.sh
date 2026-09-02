#!/usr/bin/env bash
# Zaloha a obnova lokalni databaze (8 Encore databazi najednou).
#
#   ./zaloha.sh                 vytvori zalohu do ~/Documents/Shipment Tracker/zalohy/
#   ./zaloha.sh seznam          vypise existujici zalohy
#   ./zaloha.sh obnov <slozka>  obnovi data ze zalohy
#
# Aplikace musi bezet (./run-local.sh), jinak nejdou zjistit adresy databazi.
set -uo pipefail
cd "$(dirname "$0")"

DBS="auth automation customers invoicing quotes sales shipments warehouse"
KAM="$HOME/Documents/Shipment Tracker/zalohy"
cmd="${1:-zaloha}"

nacti_uri() {
  (cd apps/api && encore db conn-uri "$1" 2>/dev/null)
}

if [ "$cmd" = "seznam" ]; then
  echo "Zalohy v $KAM:"
  if [ -d "$KAM" ]; then
    ls -1t "$KAM" 2>/dev/null | while read -r d; do
      n=$(ls -1 "$KAM/$d"/*.sql 2>/dev/null | wc -l | tr -d ' ')
      v=$(du -sh "$KAM/$d" 2>/dev/null | cut -f1)
      echo "  $d   ($n databazi, $v)"
    done
  fi
  [ -z "$(ls -A "$KAM" 2>/dev/null)" ] && echo "  (zatim zadna)"
  exit 0
fi

command -v encore >/dev/null 2>&1 || { echo "❌ chybi encore CLI"; exit 1; }
command -v pg_dump >/dev/null 2>&1 || PGDUMP_MISSING=1

if [ "$cmd" = "obnov" ]; then
  SRC="${2:-}"
  [ -z "$SRC" ] && { echo "Pouziti: ./zaloha.sh obnov <nazev-slozky>"; echo; "$0" seznam; exit 1; }
  [ -d "$KAM/$SRC" ] || { echo "❌ zaloha '$SRC' neexistuje"; "$0" seznam; exit 1; }
  echo "⚠️  Obnova PREPISE soucasna data ve vsech 8 databazich."
  printf "   Pokracovat? (napis ano): "
  read -r odp
  [ "$odp" = "ano" ] || { echo "zruseno"; exit 0; }
  for db in $DBS; do
    f="$KAM/$SRC/$db.sql"
    [ -f "$f" ] || { echo "  – $db: soubor chybi, preskakuji"; continue; }
    uri=$(nacti_uri "$db")
    [ -z "$uri" ] && { echo "  ❌ $db: aplikace nebezi?"; continue; }
    if psql "$uri" -q -f "$f" >/dev/null 2>&1; then echo "  ✅ $db obnovena"; else echo "  ❌ $db selhala"; fi
  done
  echo "Hotovo. Obnov stranku v prohlizeci."
  exit 0
fi

# — vytvoreni zalohy —
[ "${PGDUMP_MISSING:-0}" = "1" ] && { echo "❌ chybi pg_dump — nainstaluj: brew install libpq && brew link --force libpq"; exit 1; }
STAMP=$(date +%Y-%m-%d_%H-%M)
OUT="$KAM/$STAMP"
mkdir -p "$OUT"
echo "→ zaloha do: $OUT"
ok=0
for db in $DBS; do
  uri=$(nacti_uri "$db")
  if [ -z "$uri" ]; then echo "  ❌ $db: aplikace nebezi?"; continue; fi
  if pg_dump --clean --if-exists --no-owner --no-privileges "$uri" > "$OUT/$db.sql" 2>/dev/null; then
    echo "  ✅ $db ($(du -h "$OUT/$db.sql" | cut -f1))"; ok=$((ok+1))
  else
    echo "  ❌ $db selhala"; rm -f "$OUT/$db.sql"
  fi
done
echo
if [ "$ok" -eq 0 ]; then
  rmdir "$OUT" 2>/dev/null
  echo "❌ Nic se nezalohovalo. Bezi aplikace? Spust ./run-local.sh a zkus znovu."
  exit 1
fi
echo "Hotovo: $ok z 8 databazi -> $OUT"
