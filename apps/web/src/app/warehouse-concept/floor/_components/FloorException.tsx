"use client";

import { useState } from "react";
import { Input } from "antd";
import type { GateMovement } from "@/hooks/useGateLog";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/date";
import { requiredSurveyPhase, surveyPhaseKey } from "@/app/warehouse-concept/gate-log/_lib/gate";
import { EXCEPTION_GATE, EXCEPTION_TYPES } from "@/app/warehouse-concept/gate-log/_components/job/ExceptionsPanel";
import { useFloorQueue } from "../_lib/useFloorQueue";
import { Chip, FloorCard, Stepper, bigDanger } from "./floorUi";
import { FloorBack } from "./FloorBack";
import { CameraButton, TagPicker, useTakePhoto } from "./FloorPhotos";

type Prefill = { type: string; pieces: number; container: string; surveyPhase: string };

// Damage / short / over from the phone: type, pieces, container, a note and photos taken now.
// The same exception as on the gate job — while it is open the cargo is on hold. What the survey
// of the pass due now found (damaged → Damaged, lost → Short) is offered first. Resolving stays
// on the gate job.
export function FloorException({ m, onBack }: { m: GateMovement; onBack: () => void }) {
  const toast = useToast();
  const q = useFloorQueue();
  const take = useTakePhoto(m);
  const [form, setForm] = useState<Prefill>({ type: "Damaged", pieces: 1, container: m.containers[0]?.number ?? "", surveyPhase: "" });
  const [note, setNote] = useState("");
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [tag, setTag] = useState("CTN");
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  // Survey findings of the pass due now not yet recorded (same rule as the gate job).
  const phase = requiredSurveyPhase(m);
  const offers = phase
    ? m.surveys
        .filter((s) => surveyPhaseKey(s.phase) === phase)
        .flatMap((s) => {
          const recorded = (type: string) =>
            m.exceptions.some((e) => e.type === type && e.container === s.container && e.source === "survey" && surveyPhaseKey(e.surveyPhase) === phase);
          return [
            ...(s.damaged > 0 && !recorded("Damaged") ? [{ type: "Damaged", pieces: s.damaged, container: s.container, surveyPhase: s.phase }] : []),
            ...(s.lost > 0 && !recorded("Short") ? [{ type: "Short", pieces: s.lost, container: s.container, surveyPhase: s.phase }] : []),
          ];
        })
    : [];
  const open = m.exceptions.filter((e) => e.status === "open");

  const record = async () => {
    setBusy(true);
    try {
      const res = await q.submit({
        kind: "exception",
        movement: m,
        label: `${form.type} ${form.pieces} pc${form.pieces === 1 ? "" : "s"}`,
        payload: {
          exception: {
            type: form.type,
            pieces: form.pieces,
            note: note.trim(),
            container: form.container,
            surveyPhase: form.surveyPhase,
            source: form.surveyPhase ? "survey" : "manual",
            fileIds,
          },
        },
      });
      if (res.type === "sent") {
        toast.success(res.outcome === "already_recorded" ? res.notice || "Already recorded" : `${form.type} recorded — the cargo is on hold until it is resolved`);
        onBack();
      } else if (res.type === "queued") {
        toast.info(`${form.type} kept on the phone — waiting to send`);
        onBack();
      } else toast.error(res.type === "refused" ? res.error : "Failed to record the exception");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <FloorBack onBack={onBack} title="Damage / short / over" />

      {offers.length > 0 && (
        <FloorCard title="The survey found">
          <div className="flex flex-wrap gap-2">
            {offers.map((o) => (
              <Chip
                key={`${o.type}-${o.container}`}
                on={form.type === o.type && form.container === o.container && form.surveyPhase === o.surveyPhase}
                onClick={() => setForm(o)}
              >
                {o.type} — {o.pieces} pc{o.pieces === 1 ? "" : "s"}
                {o.container ? ` · ${o.container}` : ""}
              </Chip>
            ))}
          </div>
        </FloorCard>
      )}

      <FloorCard>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Type">
            {EXCEPTION_TYPES.map((t) => (
              <Chip key={t} tone="red" on={form.type === t} onClick={() => setForm({ ...form, type: t })}>
                {t}
              </Chip>
            ))}
          </div>
          <Stepper label="Pieces" min={1} value={form.pieces} onChange={(v) => setForm({ ...form, pieces: v })} />
          {m.containers.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Container">
              <Chip on={form.container === ""} onClick={() => setForm({ ...form, container: "" })}>
                Position level
              </Chip>
              {m.containers.map((c) => (
                <Chip key={c.number} on={form.container === c.number} onClick={() => setForm({ ...form, container: c.number })}>
                  {c.number}
                </Chip>
              ))}
            </div>
          )}
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="What was found…" value={note} onChange={(e) => setNote(e.target.value)} className="!text-[16px]" />
        </div>
      </FloorCard>

      <FloorCard title={`Photos (${fileIds.length})`}>
        <div className="flex flex-col gap-3">
          <TagPicker value={tag} onChange={setTag} pieces={m.colli} />
          <CameraButton
            busy={photoBusy}
            label="Take photo for this exception"
            onPhoto={async (f) => {
              setPhotoBusy(true);
              try {
                const id = await take(f, { container: form.container, tag });
                if (id) setFileIds((ids) => [...ids, id].slice(0, 20));
              } finally {
                setPhotoBusy(false);
              }
            }}
          />
        </div>
      </FloorCard>

      <p className="m-0 text-[13px] text-slate-500">
        While it is open the cargo is on hold: the release gate &ldquo;{EXCEPTION_GATE}&rdquo; is Blocked and the WH release is refused until someone resolves it with a note on
        the gate job.
      </p>

      {open.length > 0 && (
        <FloorCard title={`Open (${open.length})`}>
          <ul className="m-0 list-none p-0 text-[14px]">
            {open.map((e) => (
              <li key={e.id} className="border-b border-slate-100 py-1.5 last:border-b-0">
                <span className="font-semibold">{e.type}</span> {e.pieces} pc{e.pieces === 1 ? "" : "s"}
                {e.container ? ` · ${e.container}` : ""} · {formatDateTime(e.createdAt)}
                {e.createdBy ? ` · ${e.createdBy}` : ""}
              </li>
            ))}
          </ul>
        </FloorCard>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto max-w-[560px]">
          <button type="button" className={bigDanger} disabled={busy || photoBusy || !!m.archivedAt || form.pieces < 1} onClick={record}>
            {busy ? "Recording…" : "Record — cargo on hold"}
          </button>
        </div>
      </div>
    </div>
  );
}
