"use client";

import { useState } from "react";
import { apiErrorMessage } from "@/lib/api";
import type { PublicRespond } from "@/hooks/useTruckingConsignments";
import { respondProblem } from "../_lib/publicOrder";
import { PORTAL_DANGER, PORTAL_INPUT, PORTAL_LABEL, PORTAL_PRIMARY, PORTAL_SECONDARY } from "../_lib/portalStyles";
import { Bi } from "./Bi";
import { PortalCard } from "./PortalCard";

interface HaulierRespondFormProps {
  busy: boolean;
  onRespond: (req: PublicRespond) => Promise<unknown>;
}

// Confirm or reject the order, once: the name of who answers, and the reason of a rejection.
export const HaulierRespondForm = ({ busy, onRespond }: HaulierRespondFormProps) => {
  const [name, setName] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const action = rejecting ? "REJECT" : "CONFIRM";
  const problem = respondProblem(action, name, reason);

  const handleSubmit = async () => {
    if (problem) return;
    setError(null);
    try {
      await onRespond({ action, name: name.trim(), reason: reason.trim() });
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  };

  return (
    <PortalCard title={<Bi text={{ cs: "Potvrďte prosím objednávku", en: "Please confirm the order" }} />}>
      <label className="block">
        <span className={PORTAL_LABEL}>
          <Bi text={{ cs: "Vaše jméno", en: "Your name" }} />
        </span>
        <input className={PORTAL_INPUT} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {rejecting && (
        <label className="mt-3 block">
          <span className={PORTAL_LABEL}>
            <Bi text={{ cs: "Důvod odmítnutí", en: "Reason for rejecting" }} />
          </span>
          <textarea className={PORTAL_INPUT} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      )}
      {problem && (name || reason) && (
        <p className="mb-0 mt-2 text-[13px] text-red-600">
          <Bi text={problem} />
        </p>
      )}
      {error && <p className="mb-0 mt-2 text-[13px] text-red-600">{error}</p>}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {rejecting ? (
          <>
            <button type="button" disabled={busy || !!problem} onClick={handleSubmit} className={`${PORTAL_DANGER} flex-1`}>
              <Bi text={{ cs: "Odeslat odmítnutí", en: "Send rejection" }} />
            </button>
            <button type="button" disabled={busy} onClick={() => setRejecting(false)} className={`${PORTAL_SECONDARY} flex-1`}>
              <Bi text={{ cs: "Zpět", en: "Back" }} />
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy || !!problem} onClick={handleSubmit} className={`${PORTAL_PRIMARY} flex-1`}>
              <Bi text={{ cs: "Potvrdit", en: "Confirm" }} />
            </button>
            <button type="button" disabled={busy} onClick={() => setRejecting(true)} className={`${PORTAL_SECONDARY} flex-1`}>
              <Bi text={{ cs: "Odmítnout…", en: "Reject…" }} />
            </button>
          </>
        )}
      </div>
    </PortalCard>
  );
};
