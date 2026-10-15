"use client";

import { useState } from "react";
import { apiErrorMessage } from "@/lib/api";
import { formatFileSize } from "@/lib/files";
import type { PublicPod } from "@/hooks/useTruckingConsignments";
import { POD_ACCEPT, readUpload, uploadProblem } from "@/app/trucking/_lib/uploads";
import { localInputToIso, podProblem, toLocalInput } from "../_lib/publicOrder";
import { Bi } from "./Bi";

interface HaulierPodFormProps {
  busy: boolean;
  onUpload: (req: PublicPod) => Promise<unknown>;
}

const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[16px] text-slate-900 focus:border-indigo-500 focus:outline-none";

// The signed CMR or delivery note (photo or PDF, up to 10 MB) with who took the goods and when.
export const HaulierPodForm = ({ busy, onUpload }: HaulierPodFormProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [receiver, setReceiver] = useState("");
  const [deliveredAt, setDeliveredAt] = useState(() => toLocalInput(new Date()));
  const [error, setError] = useState<string | null>(null);
  const fileProblem = file ? uploadProblem(file, { imagesAndPdfOnly: true }) : null;
  const problem = podProblem(!!file, receiver, localInputToIso(deliveredAt));

  const handleSubmit = async () => {
    if (!file || problem || fileProblem) return;
    setError(null);
    try {
      await onUpload({ ...(await readUpload(file)), receiverName: receiver.trim(), deliveredAt: localInputToIso(deliveredAt) });
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  };

  return (
    <section className="rounded-xl border-2 border-indigo-200 bg-white p-4">
      <h2 className="m-0 mb-1 text-[15px] font-bold text-slate-900">
        <Bi text={{ cs: "Nahrát doklad o doručení (POD)", en: "Upload the proof of delivery (POD)" }} />
      </h2>
      <p className="mb-3 mt-0 text-[13px] text-slate-500">
        <Bi text={{ cs: "Fotka nebo PDF podepsaného CMR / dodacího listu, max. 10 MB.", en: "A photo or PDF of the signed CMR / delivery note, up to 10 MB." }} />
      </p>
      <label className="block">
        <span className="mb-1 block text-[13px] font-semibold text-slate-600">
          <Bi text={{ cs: "Soubor", en: "File" }} />
        </span>
        <input type="file" accept={POD_ACCEPT} className="block w-full text-[15px]" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {file && (
        <p className={`mb-0 mt-1 text-[13px] ${fileProblem ? "text-red-600" : "text-slate-500"}`}>
          {file.name} · {formatFileSize(file.size)}
          {fileProblem ? ` — ${fileProblem}` : ""}
        </p>
      )}
      <label className="mt-3 block">
        <span className="mb-1 block text-[13px] font-semibold text-slate-600">
          <Bi text={{ cs: "Jméno příjemce", en: "Receiver's name" }} />
        </span>
        <input className={input} value={receiver} onChange={(e) => setReceiver(e.target.value)} />
      </label>
      <label className="mt-3 block">
        <span className="mb-1 block text-[13px] font-semibold text-slate-600">
          <Bi text={{ cs: "Doručeno", en: "Delivered at" }} />
        </span>
        <input type="datetime-local" className={input} value={deliveredAt} onChange={(e) => setDeliveredAt(e.target.value)} />
      </label>
      {problem && file && (
        <p className="mb-0 mt-2 text-[13px] text-red-600">
          <Bi text={problem} />
        </p>
      )}
      {error && <p className="mb-0 mt-2 text-[13px] text-red-600">{error}</p>}
      <button
        type="button"
        disabled={busy || !!problem || !!fileProblem}
        onClick={handleSubmit}
        className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-3 text-[15px] font-semibold text-white disabled:opacity-50"
      >
        {busy ? <Bi text={{ cs: "Nahrávám…", en: "Uploading…" }} /> : <Bi text={{ cs: "Odeslat POD", en: "Send POD" }} />}
      </button>
    </section>
  );
};
