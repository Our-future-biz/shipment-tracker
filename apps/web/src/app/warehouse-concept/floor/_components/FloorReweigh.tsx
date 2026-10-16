"use client";

import { useState } from "react";
import { Input } from "antd";
import type { GateMovement } from "@/hooks/useGateLog";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/date";
import { TERMS } from "@/app/warehouse-concept/_lib/glossary";
import { pctText } from "@/app/warehouse-concept/_lib/cargoCompare";
import { hhmm, nf } from "@/app/warehouse-concept/gate-log/_lib/gate";
import { useFloorQueue } from "../_lib/useFloorQueue";
import { MAX_KG, typeKg } from "../_lib/keypad";
import { FloorCard, bigPrimary } from "./floorUi";
import { FloorBack } from "./FloorBack";
import { CameraButton, useTakePhoto } from "./FloorPhotos";

// The re-weigh on the phone (LCL cargo is re-weighed on receipt: inbound before the Receipt stamp,
// import before its house is ticked off at the stripping tally). A big keypad for the kg read off
// the scale, an optional photo of the scale and a note. Works offline: kept on the phone with the
// time it was weighed and sent in order — before a receipt stamped behind it.

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"] as const;

export function FloorReweigh({ m, onBack }: { m: GateMovement; onBack: () => void }) {
  const toast = useToast();
  const q = useFloorQueue();
  const take = useTakePhoto(m);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const kg = Number(value);
  const valid = value !== "" && Number.isFinite(kg) && kg > 0 && kg <= MAX_KG;
  const r = m.reweigh;

  const record = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const res = await q.submit({ kind: "reweigh", movement: m, label: `${TERMS.reweigh} ${nf(kg, kg % 1 ? 1 : 0)} kg`, payload: { reweigh: { weighedKg: kg, note: note.trim(), fileIds } } });
      if (res.type === "sent") {
        if (res.notice) toast.warning(res.notice);
        else toast.success(`Re-weighed ${nf(kg, kg % 1 ? 1 : 0)} kg`);
        onBack();
      } else if (res.type === "queued") {
        toast.info(`Re-weigh recorded at ${hhmm(res.recordedAt)} — waiting to send`);
        onBack();
      } else toast.error(res.type === "refused" ? res.error : "Failed to record the re-weigh");
    } finally {
      setBusy(false);
    }
  };

  const key = "h-14 rounded-xl border border-slate-300 bg-white text-[22px] font-bold text-slate-800 active:bg-slate-100 cursor-pointer";

  return (
    <div className="flex flex-col gap-4 pb-24">
      <FloorBack onBack={onBack} title={TERMS.reweigh} />

      {r && (
        <FloorCard title="Current re-weigh (the one that counts)">
          <div className="text-[15px] font-semibold text-slate-900">
            {nf(r.weighedKg, r.weighedKg % 1 ? 1 : 0)} kg{r.variancePct != null ? ` · ${pctText(r.variancePct)}` : ""}
            {r.flagged ? <span className="text-amber-700"> · variance</span> : null}
          </div>
          <div className="text-[13px] text-slate-500">
            {formatDateTime(r.weighedAt)}
            {r.weighedBy ? ` · ${r.weighedBy}` : ""} — a new re-weigh replaces it (the history is kept)
          </div>
        </FloorCard>
      )}

      <FloorCard title="Weighed gross kg">
        <div className="mb-3 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-right font-mono text-[32px] font-bold tabular-nums text-slate-900" aria-live="polite" aria-label="Weighed kg">
          {value || <span className="text-slate-300">0</span>} <span className="text-[18px] text-slate-500">kg</span>
        </div>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Keypad">
          {KEYS.map((k) => (
            <button key={k} type="button" className={key} aria-label={k === "⌫" ? "Delete last digit" : k} onClick={() => setValue((v) => typeKg(v, k))}>
              {k}
            </button>
          ))}
        </div>
        {m.weightKg > 0 && <div className="mt-2 text-[13px] text-slate-500">Gate figure {nf(m.weightKg)} kg — compared with the shipment&rsquo;s declared weight on the server.</div>}
      </FloorCard>

      <FloorCard title={`Scale photo (${fileIds.length})`}>
        <CameraButton
          busy={photoBusy}
          label="Photo of the scale"
          onPhoto={async (f) => {
            setPhotoBusy(true);
            try {
              const id = await take(f, { container: "", tag: "Scale" });
              if (id) setFileIds((ids) => [...ids, id].slice(0, 20));
            } finally {
              setPhotoBusy(false);
            }
          }}
        />
        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="Note (optional)" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} className="!mt-3 !text-[16px]" />
      </FloorCard>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto max-w-[560px]">
          <button type="button" className={bigPrimary} disabled={!valid || busy || photoBusy || !!m.archivedAt} onClick={record}>
            {busy ? "Recording…" : valid ? `Record ${nf(kg, kg % 1 ? 1 : 0)} kg` : "Type the weighed kg"}
          </button>
        </div>
      </div>
    </div>
  );
}
