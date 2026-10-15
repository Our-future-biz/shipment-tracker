"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input, Modal } from "antd";
import { MailOutlined } from "@ant-design/icons";
import { SavedMeanwhile } from "@/app/shipments/[jobNumber]/tabs/warehouse/JobExtras";
import type { SentWhat } from "@/hooks/useWarehouseSection";
import { formatDateTime } from "@/lib/date";
import type { GateMovement } from "@/hooks/useGateLog";
import { nf } from "../../gate-log/_lib/gate";
import { Card } from "../tabs/shared";
import type { JobDraft } from "./useJobDraft";
import type { SupplierKind } from "@/hooks/useWarehouseSettings";
import { mayHaveGoneOut, sentNotRecorded, type SupplierEmail } from "@/hooks/useSupplierEmail";
import { SEND_LABEL } from "./SendToSupplierModal";

// Block D — warehouse notes (saved with the lines from the "Save changes" bar) and "Sent to
// suppliers" for VGM, survey and remeasurement. A type that is on in Warehouse settings (with a
// To address) is e-mailed by "Send …" and recorded as sent only once the e-mail went out; a
// failed send shows why with "Retry". A type that is off keeps "Mark as sent" — recorded only.
// A resend is allowed; every send stays in the history.

export const SETTINGS_HREF = "/warehouse/settings";
export const RECORDED_ONLY_NOTE = "recorded only — set recipients in Warehouse settings to e-mail it";

/** One send; a VGM send carries the warehouse's re-weighed weight it went out with, an e-mailed one its recipients. */
export type SentEntry = { at: string; note: string; by: string; weighedKg?: number; emailedTo?: string; attachments?: number };

const kgOf = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

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
      const o = p as { timestamp: string; note?: unknown; by?: unknown; weighedKg?: unknown; emailedTo?: unknown; attachments?: unknown };
      return {
        at: o.timestamp,
        note: typeof o.note === "string" ? o.note : "",
        by: typeof o.by === "string" ? o.by : "",
        weighedKg: kgOf(o.weighedKg),
        ...emailOf(o),
      };
    }
  } catch {
    // a plain time
  }
  return { at: v, note: "", by: "" };
}

const emailOf = (o: { emailedTo?: unknown; attachments?: unknown }): Pick<SentEntry, "emailedTo" | "attachments"> =>
  typeof o.emailedTo === "string" && o.emailedTo ? { emailedTo: o.emailedTo.replace(/;\s*/g, ", "), attachments: Number(o.attachments) || 0 } : {};

/** Every send of `what`, newest first (the history; a send from before the history is kept too). */
export function sentHistory(data: Record<string, unknown>, what: SentWhat): SentEntry[] {
  const raw = data[`${what}_sent_history`];
  const list: SentEntry[] = Array.isArray(raw)
    ? raw.flatMap((e) =>
        e && typeof e === "object" && typeof (e as { at?: unknown }).at === "string"
          ? [
              {
                at: (e as { at: string }).at,
                note: String((e as { note?: unknown }).note ?? ""),
                by: String((e as { by?: unknown }).by ?? ""),
                weighedKg: kgOf((e as { weighedKg?: unknown }).weighedKg),
                ...emailOf(e as { emailedTo?: unknown; attachments?: unknown }),
              },
            ]
          : [],
      )
    : [];
  const latest = latestSent(data[`${what}_sent`]);
  if (latest && !list.some((e) => Date.parse(e.at) === Date.parse(latest.at))) list.push(latest);
  return list.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
}

/** Per type: the recipients it is e-mailed to, or null when it is recorded only. */
export type EmailedTo = Partial<Record<SupplierKind, { to: string[]; cc: string[] } | null>>;

export function NotesAndSent({
  draft,
  data,
  onMark,
  onSend,
  emailedTo = {},
  failed = {},
  m,
}: {
  draft: JobDraft;
  data: Record<string, unknown>;
  onMark: (what: SentWhat) => void;
  /** "Send …" for a type that is e-mailed (see emailedTo). */
  onSend?: (what: SupplierKind) => void;
  emailedTo?: EmailedTo;
  /** The latest attempt per type when it failed after the last send (shown with Retry). */
  failed?: Partial<Record<SupplierKind, SupplierEmail | null>>;
  /** The position's gate record: its re-weigh is the VGM weight sent. */
  m?: GateMovement;
}) {
  const anyEmailed = (["vgm", "survey", "remeasurement"] as const).some((k) => !!emailedTo[k]);
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
      <Card
        title="Sent to suppliers"
        extra={
          <Link href={SETTINGS_HREF} className="text-indigo-500">
            {anyEmailed ? "E-mailed to the recipients in Warehouse settings" : "Recorded only — set recipients in Warehouse settings"}
          </Link>
        }
      >
        <div className="flex flex-col gap-3">
          {(["vgm", "survey", "remeasurement"] as const).map((what) => (
            <SentRow
              key={what}
              what={what}
              history={sentHistory(data, what)}
              onMark={() => onMark(what)}
              onSend={onSend && emailedTo[what] ? () => onSend(what) : undefined}
              recipients={emailedTo[what] ?? null}
              failed={failed[what] ?? null}
              m={what === "vgm" ? m : undefined}
            />
          ))}
          <SentRow what="inform_operations" history={sentHistory(data, "inform_operations")} />
        </div>
      </Card>
    </div>
  );
}

const kg = (v: number) => `${nf(v, v % 1 ? 1 : 0)} kg`;

function SentRow({
  what,
  history,
  onMark,
  onSend,
  recipients,
  failed,
  m,
}: {
  what: SentWhat;
  history: SentEntry[];
  onMark?: () => void;
  /** Set when this type is e-mailed: the button sends instead of recording. */
  onSend?: () => void;
  recipients?: { to: string[]; cc: string[] } | null;
  failed?: SupplierEmail | null;
  m?: GateMovement;
}) {
  const [open, setOpen] = useState(false);
  const last = history[0];
  // The latest attempt when it did not end as a recorded send, and only if after the last send.
  const failedNow = failed && (!last || Date.parse(failed.createdAt) > Date.parse(last.at)) ? failed : null;
  const notRecorded = sentNotRecorded(failedNow);
  const unsure = mayHaveGoneOut(failedNow);
  // VGM: the warehouse's re-weigh is the weight that is sent (LCL cargo is re-weighed on receipt).
  const rw = m?.reweigh;
  const weight = what === "vgm" && m ? (
    rw ? (
      <span className="block text-[11px] text-slate-600">
        Re-weighed {kg(rw.weighedKg)} · {formatDateTime(rw.weighedAt)}
        {rw.weighedBy ? ` · ${rw.weighedBy}` : ""}
        {last?.weighedKg && last.weighedKg !== rw.weighedKg ? <span className="text-amber-700"> — re-weighed again since the last send</span> : null}
      </span>
    ) : m.needsReweigh ? (
      <span className="block text-[11px] font-semibold text-red-600">Not re-weighed yet — LCL cargo is re-weighed on receipt</span>
    ) : null
  ) : null;
  return (
    <div className="border-b border-slate-100 last:border-b-0 pb-2 last:pb-0">
      <div className="flex items-center gap-3 text-xs">
        <span className="w-[130px] shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-500">{SENT_LABEL[what]}</span>
        <span className="flex-1 min-w-0">
          {last ? (
            <>
              <span className="font-semibold text-emerald-700">{what === "inform_operations" ? "Informed" : "Sent"} {formatDateTime(last.at)}</span>
              {last.by && <span className="text-slate-500"> · {last.by}</span>}
              {last.weighedKg ? <span className="text-slate-500"> · {kg(last.weighedKg)}</span> : null}
              {last.emailedTo ? (
                <span className="block text-[11px] text-slate-500 break-words">
                  <MailOutlined /> E-mailed to {last.emailedTo}
                  {last.attachments ? ` · ${last.attachments} attached` : ""}
                </span>
              ) : what !== "inform_operations" ? (
                <span className="block text-[11px] text-slate-400">recorded only</span>
              ) : null}
              {last.note && <span className="block text-[11px] text-slate-500 break-words">{last.note}</span>}
            </>
          ) : (
            <span className="text-slate-300">{what === "inform_operations" ? "not informed" : "not sent"}</span>
          )}
          {weight}
          {failedNow && notRecorded && (
            <span className="block text-[11px] font-semibold text-red-600 break-words">
              E-mailed {formatDateTime(failedNow.sentAt ?? failedNow.createdAt)} to {failedNow.to.join(", ")}, but not marked as sent — use Mark as sent to record it; do not send it again
            </span>
          )}
          {failedNow && !notRecorded && (
            <span className="block text-[11px] font-semibold text-red-600 break-words">
              {failedNow.status === "unknown" ? "Last e-mail never finished" : "Last e-mail failed"} ({formatDateTime(failedNow.createdAt)}): {failedNow.error || "unknown error"} — not marked as sent
              {unsure ? ". It may have reached the supplier — check with them before sending it again." : ""}
            </span>
          )}
          {onMark && !onSend && what !== "inform_operations" && (
            <span className="block text-[11px] text-slate-400">
              <Link href={SETTINGS_HREF} className="text-slate-400 hover:text-indigo-500">
                {RECORDED_ONLY_NOTE}
              </Link>
            </span>
          )}
          {onSend && recipients && <span className="block text-[11px] text-slate-500 break-words">Sends to {recipients.to.join(", ")}{recipients.cc.length ? ` · Cc ${recipients.cc.join(", ")}` : ""}</span>}
        </span>
        {history.length > 1 && (
          <button type="button" className="text-[11px] text-indigo-500 bg-transparent border-none p-0 cursor-pointer" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? "Hide" : `History (${history.length})`}
          </button>
        )}
        {onSend && notRecorded && onMark ? (
          <Button size="small" type="primary" onClick={onMark}>
            Mark as sent
          </Button>
        ) : onSend ? (
          <Button size="small" type={failedNow && !unsure ? "primary" : "default"} danger={!!failedNow} icon={<MailOutlined />} onClick={onSend}>
            {unsure ? "Send again anyway" : failedNow ? "Retry" : last ? "Send again" : `Send ${SEND_LABEL[what as SupplierKind]}`}
          </Button>
        ) : (
          onMark && (
            <Button size="small" onClick={onMark}>
              {last ? "Mark sent again" : "Mark as sent"}
            </Button>
          )
        )}
      </div>
      {open && (
        <ul className="list-none m-0 mt-1.5 ml-[142px] p-0 text-[11px] text-slate-600">
          {history.map((e, i) => (
            <li key={`${e.at}-${i}`} className="py-0.5">
              <span className="font-mono">{formatDateTime(e.at)}</span>
              {e.by ? ` · ${e.by}` : ""}
              {e.weighedKg ? ` · ${kg(e.weighedKg)}` : ""}
              {e.emailedTo ? ` · e-mailed to ${e.emailedTo}` : what !== "inform_operations" ? " · recorded only" : ""}
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
  m,
}: {
  what: SentWhat | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (what: SentWhat, note: string) => Promise<unknown>;
  /** The position's gate record: a VGM send records its re-weighed weight. */
  m?: GateMovement;
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
          : "Nothing is e-mailed — this records that it was sent outside the app (recorded only — set recipients in Warehouse settings to e-mail it). Sending again is allowed; every send is kept in the history."}
      </p>
      {what === "vgm" && m?.reweigh && (
        <p className="text-xs text-slate-700 mt-0 mb-3">
          Weight sent: <b>re-weighed {kg(m.reweigh.weighedKg)}</b> ({formatDateTime(m.reweigh.weighedAt)}) — recorded with the send.
        </p>
      )}
      {what === "vgm" && !m?.reweigh && m?.needsReweigh && (
        <p className="text-xs font-semibold text-amber-700 mt-0 mb-3">Not re-weighed yet — the send is logged as &ldquo;not re-weighed yet&rdquo;. LCL cargo is re-weighed on receipt.</p>
      )}
      <Input.TextArea placeholder="Add a note (optional)…" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}
