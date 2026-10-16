"use client";

import { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useTruckingUnsent } from "@/hooks/useSendAgain";

interface TruckingSendAgainProps {
  /** A consignment's job updates, or (with tripId) those of the consignments on the trip */
  consignmentId?: string;
  tripId?: string;
  manager: boolean;
}

// Above the history (managers): the job updates that could not be sent for good ("Not sent")
// and "Send again", which sends them once more (logged in the history).
export const TruckingSendAgain = ({ consignmentId, tripId, manager }: TruckingSendAgainProps) => {
  const toast = useToast();
  const { updates, sendAgain } = useTruckingUnsent({ consignmentId, tripId }, manager);
  if (!manager || !updates.length) return null;
  const what = [...new Set(updates.map((u) => (tripId ? `${u.consignmentRef}: ${u.what}` : u.what)))].join(", ");
  const lastError = updates.at(-1)?.lastError ?? "";

  const handleSendAgain = () =>
    sendAgain
      .mutateAsync()
      .then((res) => (res.unsent.length ? toast.error("Still not sent — see the reason") : toast.success("Sent again")))
      .catch((e: unknown) => toast.error(`Send again: ${apiErrorMessage(e)}`));

  return (
    <div role="status" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      <span className="min-w-0 flex-1">
        <span className="font-semibold">Not sent</span> — {what}
        {lastError ? ` · ${lastError}` : ""}
      </span>
      <button
        type="button"
        aria-label="Send the failed updates again"
        disabled={sendAgain.isPending}
        onClick={handleSendAgain}
        className="inline-flex h-7 shrink-0 cursor-pointer items-center rounded border border-red-300 bg-white px-3 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Send again
      </button>
    </div>
  );
};
