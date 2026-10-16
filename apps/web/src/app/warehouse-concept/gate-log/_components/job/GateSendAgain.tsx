"use client";

import { useToast } from "@/lib/toast";
import { useGateUnsent } from "@/hooks/useSendAgain";
import { errorMessage } from "../../_lib/gate";
import { btnInline } from "./fields";

interface GateSendAgainProps {
  movementId: string;
  manager: boolean;
}

// In the gate job's history (managers): what the record could not send for good — shipment
// updates (dates, plate) and the events for Trucking — and "Send again" (logged).
export const GateSendAgain = ({ movementId, manager }: GateSendAgainProps) => {
  const toast = useToast();
  const { unsent, sendAgain } = useGateUnsent(movementId, manager);
  if (!manager || !unsent) return null;
  const what = [...unsent.shipmentUpdates, ...unsent.gateEvents.map((e) => `${e} for Trucking`)].join(", ");

  const handleSendAgain = () =>
    sendAgain
      .mutateAsync()
      .then((res) => (res.unsent ? toast.error("Still not sent — see the reason") : toast.success("Sent again")))
      .catch((e: unknown) => toast.error(errorMessage(e, "Failed to send again")));

  return (
    <div role="status" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      <span className="min-w-0 flex-1">
        <span className="font-semibold">Not sent</span> — {what}
        {unsent.lastError ? ` · ${unsent.lastError}` : ""}
      </span>
      <button type="button" aria-label="Send the failed updates again" className={btnInline} disabled={sendAgain.isPending} onClick={handleSendAgain}>
        Send again
      </button>
    </div>
  );
};
