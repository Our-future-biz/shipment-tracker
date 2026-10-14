"use client";

import { useEffect, useState } from "react";
import { Input } from "antd";
import { useGateFiles, type GateMovement } from "@/hooks/useGateLog";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/date";
import { INNER_FLAGS, OUTER_PACKINGS, VISUAL_FLAGS, hasSurvey, requiredSurveyPhase, surveyPhaseKey, surveyTargets } from "@/app/warehouse/gate-log/_lib/gate";
import { blankLine, blankSurvey, lineFilled, pickInput, surveyPhotoCheck, type SurveyInput, type SurveyLine } from "@/app/warehouse/gate-log/_lib/survey";
import { useFloorQueue } from "../_lib/useFloorQueue";
import { Chip, FloorCard, Stepper, bigDefault, bigPrimary } from "./floorUi";
import { FloorBack } from "./FloorBack";
import { CameraButton, useTakePhoto } from "./FloorPhotos";

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

// The survey of the pass due now (receipt after the gate-in, release after the WH release or
// gate-out), one container per screen. The same survey as the gate job's Survey tab; saved with
// one button (kept on the phone and sent later when offline). Damaged or lost pieces offer to
// record an exception, which puts the cargo on hold.
export function FloorSurvey({ m, onBack, onRecordException }: { m: GateMovement; onBack: () => void; onRecordException: () => void }) {
  const toast = useToast();
  const q = useFloorQueue();
  const phase = requiredSurveyPhase(m);
  const targets = surveyTargets(m);
  const [container, setContainer] = useState(targets.find((c) => phase && !hasSurvey(m, c, phase)) ?? targets[0] ?? "");
  const stored = phase ? m.surveys.find((s) => s.container === container && surveyPhaseKey(s.phase) === phase) : undefined;
  const [draft, setDraft] = useState<SurveyInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shooting, setShooting] = useState(false);
  const { files } = useGateFiles(m.id);
  const take = useTakePhoto(m);

  // A fresh form for another container; the stored survey when there is one.
  useEffect(() => {
    if (!phase) return;
    setDraft(stored ? pickInput(stored) : blankSurvey(container, phase));
    setSaved(false);
    // Only when the container or pass changes; own saves echo back the same values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, phase]);

  if (!phase || !draft) {
    return (
      <div className="flex flex-col gap-4">
        <FloorBack onBack={onBack} title="Survey" />
        <FloorCard>
          <div className="text-[15px] text-slate-600">The survey starts once the cargo has arrived (gate-in).</div>
        </FloorCard>
      </div>
    );
  }

  const setLine = (i: number, patch: Partial<SurveyLine>) => setDraft({ ...draft, lines: draft.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) });
  const pieces = m.colli;
  const last = draft.lines[draft.lines.length - 1];
  // Photos of this container: stored ones and ones still waiting to send from this phone.
  const containerPhotos =
    files.filter((f) => f.fileType.startsWith("image/") && f.container === container).length +
    q.items.filter((i) => i.kind === "photo" && i.movementId === m.id && i.state !== "failed" && i.payload.container === container).length;
  const photoCheck = surveyPhotoCheck(draft.lines, containerPhotos);

  const save = async () => {
    setSaving(true);
    try {
      const res = await q.submit({
        kind: "survey",
        movement: m,
        label: `Survey (${phase}${container ? `, ${container}` : ""})`,
        payload: { survey: draft },
      });
      if (res.type === "sent") {
        if (res.outcome === "newer_exists") toast.warning(res.notice || "A later survey of this container is kept — this one was not saved");
        else toast.success("Survey saved");
        setSaved(true);
      } else if (res.type === "queued") {
        toast.info("Survey kept on the phone — waiting to send");
        setSaved(true);
      } else toast.error(res.type === "refused" ? res.error : "Failed to save the survey");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <FloorBack onBack={onBack} title={`Survey — ${phase === "release" ? "release" : "receipt"} pass`} />

      {targets.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Container">
          {targets.map((c) => (
            <Chip key={c} on={c === container} onClick={() => setContainer(c)}>
              {hasSurvey(m, c, phase) ? "✓ " : ""}
              {c || "Position"}
            </Chip>
          ))}
        </div>
      )}
      <div className="text-[14px] text-slate-600">
        {container ? (
          <>
            Container <span className="font-mono font-semibold text-slate-900">{container}</span>
          </>
        ) : (
          "Position level (no container recorded)"
        )}
        {stored ? ` · last saved ${formatDateTime(stored.surveyedAt)}${stored.surveyedBy ? ` · ${stored.surveyedBy}` : ""}` : ""}
      </div>

      {draft.lines.map((l, i) => (
        <FloorCard key={i} title={draft.lines.length > 1 ? `Line ${i + 1}` : "Packages"}>
          <div className="flex flex-col gap-3">
            <Stepper label="Number" value={l.qty ?? 0} onChange={(v) => setLine(i, { qty: v })} />
            <div>
              <div className="mb-1 text-[13px] font-bold uppercase tracking-wide text-slate-500">Outer packing</div>
              <div className="flex flex-wrap gap-2">
                {OUTER_PACKINGS.map((p) => (
                  <Chip key={p} on={l.outerPacking === p} onClick={() => setLine(i, { outerPacking: l.outerPacking === p ? "" : p })}>
                    {p}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[13px] font-bold uppercase tracking-wide text-slate-500">Visual condition</div>
              <div className="flex flex-wrap gap-2">
                {VISUAL_FLAGS.map((f) => (
                  <Chip key={f} tone="red" on={l.visual.includes(f)} onClick={() => setLine(i, { visual: toggle(l.visual, f) })}>
                    {f}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[13px] font-bold uppercase tracking-wide text-slate-500">Inner content</div>
              <div className="flex flex-wrap gap-2">
                {INNER_FLAGS.map((f) => (
                  <Chip key={f} on={l.inner.includes(f)} onClick={() => setLine(i, { inner: toggle(l.inner, f) })}>
                    {f}
                  </Chip>
                ))}
              </div>
            </div>
            {draft.lines.length > 1 && (
              <button type="button" className={`${bigDefault} !text-red-600`} onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, idx) => idx !== i) })}>
                Remove line {i + 1}
              </button>
            )}
          </div>
        </FloorCard>
      ))}
      <button type="button" className={bigDefault} disabled={!last || !lineFilled(last)} onClick={() => setDraft({ ...draft, lines: [...draft.lines, blankLine()] })}>
        Add another line
      </button>

      {photoCheck.short && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-[15px] text-amber-900">{photoCheck.text}</div>
          <div className="mt-2">
            <CameraButton
              busy={shooting}
              onPhoto={async (f) => {
                setShooting(true);
                try {
                  await take(f, { container, tag: "CTN" });
                } finally {
                  setShooting(false);
                }
              }}
            />
          </div>
        </div>
      )}

      <FloorCard title="Pieces">
        <div className="flex flex-col gap-3">
          <Stepper label="Damaged" value={draft.damaged} max={pieces} onChange={(v) => setDraft({ ...draft, damaged: v })} />
          <Stepper label="Lost / missing" value={draft.lost} max={pieces} onChange={(v) => setDraft({ ...draft, lost: v })} />
          {pieces > 0 && <div className="text-[13px] text-slate-500">Of {pieces} pieces on the position.</div>}
        </div>
      </FloorCard>

      <FloorCard title="Notes">
        <div className="flex flex-col gap-2">
          <Input.TextArea
            autoSize={{ minRows: 2, maxRows: 5 }}
            placeholder="Driver's note related to survey"
            value={draft.driverNote}
            onChange={(e) => setDraft({ ...draft, driverNote: e.target.value })}
            className="!text-[16px]"
          />
          <Input.TextArea
            autoSize={{ minRows: 2, maxRows: 5 }}
            placeholder="Warehouse note"
            value={draft.warehouseNote}
            onChange={(e) => setDraft({ ...draft, warehouseNote: e.target.value })}
            className="!text-[16px]"
          />
        </div>
      </FloorCard>

      {saved && (draft.damaged > 0 || draft.lost > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-[15px] text-amber-900">
            This survey found {draft.damaged > 0 ? `${draft.damaged} damaged` : ""}
            {draft.damaged > 0 && draft.lost > 0 ? " and " : ""}
            {draft.lost > 0 ? `${draft.lost} missing` : ""} — record it as an exception (the cargo is then on hold).
          </div>
          <button type="button" className={`${bigDefault} mt-2`} onClick={onRecordException}>
            Record damage / short
          </button>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto max-w-[560px]">
          <button type="button" className={bigPrimary} disabled={saving || !!m.archivedAt} onClick={save}>
            {saving ? "Saving…" : "Save survey"}
          </button>
        </div>
      </div>
    </div>
  );
}
