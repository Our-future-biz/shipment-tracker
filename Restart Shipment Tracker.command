#!/bin/bash
# Dvojklikem restartuje aplikaci: ukonci bezici procesy a spusti ji znovu.
# Pouzij po zmene databaze nebo API (obnoveni prohlizece na to nestaci).
REPO="$HOME/Projects/shipment-tracker"
cd "$REPO" 2>/dev/null || { echo "❌ Slozka $REPO neexistuje."; read -r -p "Enter zavre okno."; exit 1; }

echo "────────────────────────────────────────────────────────"
echo " RESTART APLIKACE"
echo "────────────────────────────────────────────────────────"
echo ""

# 1) Ukoncit, co drzi porty 3001 (web) a 4001 (API).
zabito=0
for port in 3001 4001; do
  pid=$(lsof -ti tcp:$port 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "→ ukoncuji proces na portu $port"
    kill $pid 2>/dev/null || true
    zabito=1
  fi
done

# 2) Dobehnout zbytky (encore, next) spustene z tohoto repa.
pkill -f "encore run" 2>/dev/null && zabito=1
pkill -f "next dev --port 3001" 2>/dev/null && zabito=1

if [ "$zabito" = "1" ]; then
  echo "→ cekam, az se porty uvolni"
  for i in $(seq 1 15); do
    if ! lsof -ti tcp:3001 >/dev/null 2>&1 && ! lsof -ti tcp:4001 >/dev/null 2>&1; then break; fi
    sleep 1
  done
  # Tvrde ukonceni, kdyby neco drzelo dal.
  for port in 3001 4001; do
    pid=$(lsof -ti tcp:$port 2>/dev/null || true)
    [ -n "$pid" ] && kill -9 $pid 2>/dev/null || true
  done
  echo "✅ stara instance ukoncena"
else
  echo "ℹ️  aplikace nebezela, spoustim ji"
fi
echo ""

# 3) Az web nabehne, otevri ho v prohlizeci.
(
  for i in $(seq 1 90); do
    if curl -s -o /dev/null http://localhost:3001 2>/dev/null; then
      open http://localhost:3001
      break
    fi
    sleep 2
  done
) &

# 4) Spustit znovu (migrace probehnou pri startu API).
./run-local.sh
