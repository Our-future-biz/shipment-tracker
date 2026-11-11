"use client";

import { useState } from "react";
import { apiErrorMessage } from "@/lib/api";
import { DELIVERED_NOW_HINT, deliveredAtToSend } from "../_lib/publicOrder";
import { receiverProblem } from "../_lib/portal";
import { PORTAL_INPUT, PORTAL_LABEL, PORTAL_PRIMARY } from "../_lib/portalStyles";
import { Bi } from "./Bi";

interface PortalDeliveredFormProps {
  busy: boolean;
  onDelivered: (req: { at: string | null; receiverName: string }) => Promise<unknown>;
}

// Stamps one stop delivered: who took the goods and when. The time is left empty for now (the
// moment it is sent), so a stop delivered hours after the page was opened is not stamped back then.
export const PortalDeliveredForm = ({ busy, onDelivered }: PortalDeliveredFormProps) => {
  const [receiver, setReceiver] = useState("");
  const [at, setAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const problem = receiverProblem(receiver);

  const handleSubmit = async () => {
    if (problem) return;
    setError(null);
    try {
      await onDelivered({ at: deliveredAtToSend(at), receiverName: receiver.trim() });
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  };

  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3">
      <label className="block">
        <span className={PORTAL_LABEL}>
          <Bi text={{ cs: "Jméno příjemce", en: "Receiver's name" }} />
        </span>
        <input className={PORTAL_INPUT} value={receiver} onChange={(e) => setReceiver(e.target.value)} />
      </label>
      <label className="mt-2 block">
        <span className={PORTAL_LABEL}>
          <Bi text={{ cs: "Doručeno", en: "Delivered at" }} />
        </span>
        <input type="datetime-local" className={`${PORTAL_INPUT} min-h-11`} value={at} onChange={(e) => setAt(e.target.value)} />
      </label>
      <p className="mb-0 mt-1 text-[13px] text-slate-500">
        <Bi text={DELIVERED_NOW_HINT} />
      </p>
      {error && <p className="mb-0 mt-2 text-[13px] text-red-600">{error}</p>}
      <button type="button" disabled={busy || !!problem} onClick={handleSubmit} className={`${PORTAL_PRIMARY} mt-3`}>
        <Bi text={{ cs: "Doručeno", en: "Delivered" }} />
      </button>
    </div>
  );
};
