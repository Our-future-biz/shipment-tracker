"use client";

import { useState } from "react";
import { apiErrorMessage } from "@/lib/api";
import { rejectProblem } from "../_lib/portal";
import { PORTAL_DANGER, PORTAL_INPUT, PORTAL_LABEL, PORTAL_PRIMARY, PORTAL_SECONDARY } from "../_lib/portalStyles";
import { Bi } from "./Bi";
import { PortalCard } from "./PortalCard";

interface PortalRespondCardProps {
  busy: boolean;
  onRespond: (req: { action: "CONFIRM" | "REJECT"; reason: string }) => Promise<unknown>;
}

// Confirm or reject the order, once. The signed-in portal user is who answers; a rejection needs its reason.
export const PortalRespondCard = ({ busy, onRespond }: PortalRespondCardProps) => {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const problem = rejecting ? rejectProblem(reason) : null;

  const handleSend = async (action: "CONFIRM" | "REJECT") => {
    if (action === "REJECT" && problem) return;
    setError(null);
    try {
      await onRespond({ action, reason: action === "REJECT" ? reason.trim() : "" });
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  };

  return (
    <PortalCard title={<Bi text={{ cs: "Potvrďte prosím objednávku", en: "Please confirm the order" }} />}>
      {rejecting && (
        <label className="block">
          <span className={PORTAL_LABEL}>
            <Bi text={{ cs: "Důvod odmítnutí", en: "Reason for rejecting" }} />
          </span>
          <textarea className={PORTAL_INPUT} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      )}
      {problem && reason && (
        <p className="mb-0 mt-2 text-[13px] text-red-600">
          <Bi text={problem} />
        </p>
      )}
      {error && <p className="mb-0 mt-2 text-[13px] text-red-600">{error}</p>}
      <div className="mt-3 flex flex-col gap-2 first:mt-0 sm:flex-row">
        {rejecting ? (
          <>
            <button
              type="button"
              disabled={busy || !!problem}
              onClick={() => handleSend("REJECT")}
              className={`${PORTAL_DANGER} flex-1`}
            >
              <Bi text={{ cs: "Odeslat odmítnutí", en: "Send rejection" }} />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejecting(false)}
              className={`${PORTAL_SECONDARY} flex-1`}
            >
              <Bi text={{ cs: "Zpět", en: "Back" }} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleSend("CONFIRM")}
              className={`${PORTAL_PRIMARY} flex-1`}
            >
              <Bi text={{ cs: "Potvrdit", en: "Confirm" }} />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejecting(true)}
              className={`${PORTAL_SECONDARY} flex-1`}
            >
              <Bi text={{ cs: "Odmítnout…", en: "Reject…" }} />
            </button>
          </>
        )}
      </div>
    </PortalCard>
  );
};
