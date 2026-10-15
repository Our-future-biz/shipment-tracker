"use client";

import { useState } from "react";
import { apiErrorMessage } from "@/lib/api";
import type { PublicRespond } from "@/hooks/useTruckingConsignments";
import { respondProblem } from "../_lib/publicOrder";
import { Bi } from "./Bi";

interface HaulierRespondFormProps {
  busy: boolean;
  onRespond: (req: PublicRespond) => Promise<unknown>;
}

const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[16px] text-slate-900 focus:border-indigo-500 focus:outline-none";

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
    <section className="rounded-xl border-2 border-indigo-200 bg-white p-4">
      <h2 className="m-0 mb-3 text-[15px] font-bold text-slate-900">
        <Bi text={{ cs: "Potvrďte prosím objednávku", en: "Please confirm the order" }} />
      </h2>
      <label className="block">
        <span className="mb-1 block text-[13px] font-semibold text-slate-600">
          <Bi text={{ cs: "Vaše jméno", en: "Your name" }} />
        </span>
        <input className={input} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {rejecting && (
        <label className="mt-3 block">
          <span className="mb-1 block text-[13px] font-semibold text-slate-600">
            <Bi text={{ cs: "Důvod odmítnutí", en: "Reason for rejecting" }} />
          </span>
          <textarea className={input} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
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
            <button type="button" disabled={busy || !!problem} onClick={handleSubmit} className="flex-1 rounded-lg bg-red-600 px-4 py-3 text-[15px] font-semibold text-white disabled:opacity-50">
              <Bi text={{ cs: "Odeslat odmítnutí", en: "Send rejection" }} />
            </button>
            <button type="button" disabled={busy} onClick={() => setRejecting(false)} className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-[15px] font-semibold text-slate-700">
              <Bi text={{ cs: "Zpět", en: "Back" }} />
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy || !!problem} onClick={handleSubmit} className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-[15px] font-semibold text-white disabled:opacity-50">
              <Bi text={{ cs: "Potvrdit", en: "Confirm" }} />
            </button>
            <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="flex-1 rounded-lg border border-red-300 bg-white px-4 py-3 text-[15px] font-semibold text-red-700">
              <Bi text={{ cs: "Odmítnout…", en: "Reject…" }} />
            </button>
          </>
        )}
      </div>
    </section>
  );
};
