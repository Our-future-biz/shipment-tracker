"use client";

import { useState } from "react";
import { Button, Input, Modal } from "antd";
import { SavedMeanwhile } from "@/app/shipments/[jobNumber]/tabs/warehouse/JobExtras";
import type { SentWhat } from "@/hooks/useWarehouseSection";
import { formatDateTime } from "@/lib/date";
import { Card } from "../tabs/shared";
import type { JobDraft } from "./useJobDraft";

// Block D — warehouse notes (saved with the lines from the "Save changes" bar) and "Mark as sent"
// for VGM, survey and remeasurement. Nothing is e-mailed from here: it records that the document
// went to the supplier outside the app. A resend is allowed; every send stays in the history.

export type SentEntry = { at: string; note: string; by: string };

export const SENT_LABEL: Record<SentWhat, string> = {
  vgm: "VGM",
  survey: "Survey",
  remeasurement: "Remeasurement",
  inform_operations: "Operations informed",
};

// The latest send as stored: JSON {timestamp, note, by}, or a plain time from before.
function latestSent(v: unknown): SentEntry | null {
  if (typeof v !== "string" || !v) return null;
  try {
    const p: unknown = JSON.parse(v);
    if (p && typeof p === "object" && typeof (p as { timestamp?: unknown }).timestamp === "string") {
      const o = p as { timestamp: string; note?: unknown; by?: unknown };
      return { at: o.timestamp, note: typeof o.note === "string" ? o.note : "", by: typeof o.by === "string" ? o.by : "" };
    }
  } catch {
    // a plain time
  }
  return { at: v, note: "", by: "" };
}

/** Every send of `what`, newest first (the history; a send from before the history is kept too). */
export function sentHistory(data: Record<string, unknown>, what: SentWhat): SentEntry[] {
  const raw = data[`${what}_sent_history`];
  const list: SentEntry[] = Array.isArray(raw)
    ? raw.flatMap((e) =>
        e && typeof e === "object" && typeof (e as { at?: unknown }).at === "string"
          ? [{ at: (e as { at: string }).at, note: String((e as { note?: unknown }).note ?? ""), by: String((e as { by?: unknown }).by ?? "") }]
          : [],
      )
    : [];
  const latest = latestSent(data[`${what}_sent`]);
  if (latest && !list.some((e) => Date.parse(e.at) === Date.parse(latest.at))) list.push(latest);
  return list.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
}

export function NotesAndSent({
  draft,
  data,
  onMark,
}: {
  draft: JobDraft;
  data: Record<string, unknown>;
  onMark: (what: SentWhat) => void;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
      <Card title="Notes" extra={draft.notesChanged ? <span className="text-amber-700">unsaved</span> : undefined}>
        {draft.notesConflict && (
          <SavedMeanwhile theirs={draft.savedNotes || "(no notes)"} onUseTheirs={draft.notesUseTheirs} onKeepMine={draft.notesKeepMine} />
        )}
        <Input.TextArea
          aria-label="Warehouse notes"
          autoSize={{ minRows: 3, maxRows: 10 }}
          value={draft.notes}
          placeholder="Warehouse notes…"
          onChange={(e) => draft.setNotes(e.target.value)}
        />
      </Card>
      <Card title="Sent to suppliers" extra="recorded only — nothing is e-mailed">
        <div className="flex flex-col gap-3">
          {(["vgm", "survey", "remeasurement"] as const).map((what) => (
            <SentRow key={what} what={what} history={sentHistory(data, what)} onMark={() => onMark(what)} />
          ))}
          <SentRow what="inform_operations" history={sentHistory(data, "inform_operations")} />
        </div>
      </Card>
    </div>
  );
}

function SentRow({ what, history, onMark }: { what: SentWhat; history: SentEntry[]; onMark?: () => void }) {
  const [open, setOpen] = useState(false);
  const last = history[0];
  return (
    <div className="border-b border-slate-100 last:border-b-0 pb-2 last:pb-0">
      <div className="flex items-center gap-3 text-xs">
        <span className="w-[130px] shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-500">{SENT_LABEL[what]}</span>
        <span className="flex-1 min-w-0">
          {last ? (
            <>
              <span className="font-semibold text-emerald-700">{what === "inform_operations" ? "Informed" : "Sent"} {formatDateTime(last.at)}</span>
              {last.by && <span className="text-slate-500"> · {last.by}</span>}
              {last.note && <span className="block text-[11px] text-slate-500 break-words">{last.note}</span>}
            </>
          ) : (
            <span className="text-slate-300">{what === "inform_operations" ? "not informed" : "not sent"}</span>
          )}
        </span>
        {history.length > 1 && (
          <button type="button" className="text-[11px] text-indigo-500 bg-transparent border-none p-0 cursor-pointer" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? "Hide" : `History (${history.length})`}
          </button>
        )}
        {onMark && (
          <Button size="small" onClick={onMark}>
            {last ? "Mark sent again" : "Mark as sent"}
          </Button>
        )}
      </div>
      {open && (
        <ul className="list-none m-0 mt-1.5 ml-[142px] p-0 text-[11px] text-slate-600">
          {history.map((e, i) => (
            <li key={`${e.at}-${i}`} className="py-0.5">
              <span className="font-mono">{formatDateTime(e.at)}</span>
              {e.by ? ` · ${e.by}` : ""}
              {e.note ? ` — ${e.note}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Asks for an optional note, then records the send (or Operations informed). */
export function MarkSentModal({
  what,
  saving,
  onClose,
  onSubmit,
}: {
  what: SentWhat | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (what: SentWhat, note: string) => Promise<unknown>;
}) {
  const [note, setNote] = useState("");
  const close = () => {
    setNote("");
    onClose();
  };
  const inform = what === "inform_operations";
  return (
    <Modal
      open={!!what}
      title={inform ? "Inform Operations" : `Mark ${what ? SENT_LABEL[what] : ""} as sent`}
      okText={inform ? "Inform Operations" : "Mark as sent"}
      confirmLoading={saving}
      onCancel={close}
      onOk={() =>
        what &&
        onSubmit(what, note.trim())
          .then(close)
          .catch(() => undefined)
      }
      destroyOnHidden
    >
      <p className="text-xs text-slate-500 mt-0 mb-3">
        {inform
          ? "Records that Operations were told about the difference (who and when are logged). Nothing is e-mailed."
          : "Nothing is e-mailed — this records that it was sent outside the app. Sending again is allowed; every send is kept in the history."}
      </p>
      <Input.TextArea placeholder="Add a note (optional)…" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}
