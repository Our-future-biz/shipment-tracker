#!/bin/bash
# Dvojklikem spusti Shipment Tracker.
# Toto okno nechej OTEVRENE, dokud s aplikaci pracujes - zavrenim se aplikace vypne.
cd "$(dirname "$0")"

# Az bude web na :3001 nasloucha, otevri ho v prohlizeci (bezi na pozadi).
(
  for i in $(seq 1 90); do
    if curl -s -o /dev/null http://localhost:3001 2>/dev/null; then
      open http://localhost:3001
      break
    fi
    sleep 2
  done
) &

./run-local.sh
