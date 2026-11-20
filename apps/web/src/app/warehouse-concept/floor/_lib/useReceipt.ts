"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, services } from "@/lib/api/client";
import { useGateRowCache, invalidateAfterGateEvent } from "@/hooks/useGateLog";

// The receipt of loose import cargo (an outbound position with no container: pieces counted,
// condition, location — POST /warehouse-concept/gate/:id/receipt). It needs a connection: the
// server receives the position, opens its stock line and sends its shipment the received date.
// The returned row goes into the cache at once (floor mode works from the cached list), then
// everything built from gate records is read again.
export type ReceiptInput = services.PositionReceiptInput;
export type ReceiptResult = controllers.PositionReceiptResponse;

export function useRecordReceipt() {
  const queryClient = useQueryClient();
  const writeRow = useGateRowCache();
  return useMutation({
    mutationFn: ({ id, receipt }: { id: string; receipt: ReceiptInput }) => api.warehouseConcept.gateMovementReceipt(id, { receipt }),
    onSuccess: (res) => {
      writeRow(res.movement);
      void invalidateAfterGateEvent(queryClient);
    },
  });
}
