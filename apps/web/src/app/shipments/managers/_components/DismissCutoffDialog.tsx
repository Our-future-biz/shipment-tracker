"use client";

import { useId, useState } from "react";
import { Input, Modal, Radio } from "antd";
import { useCutoffDismissals, type CutoffDismissalItem } from "@/hooks/useShipmentManagerActions";
import { apiErrorMessage } from "@/lib/api";
import { businessDateTime } from "@/lib/date";
import { actionReasonOk, cutoffName, dismissalTitle, MAX_ACTION_REASON, MIN_ACTION_REASON } from "@/lib/managerActions";
import { BTN, BTN_PRIMARY, HINT, LABEL_TEXT, LINK, REF } from "@/styles/ui";

// Dismissing a missed cut-off: a manager says, with a reason, that a missed Closing or an overdue filing is
// settled (the cargo went on a later vessel, the carrier took the VGM late). While the cut-off keeps its date it
// then gives no signal on the Shipments list nor on Shipments → Managers. The dialog also lists the job's
// dismissals that stand, each to be taken back - the cut-off then counts again. Opened with no cut-off to dismiss
// (the row menu's "Dismissed cut-offs…"), it is that list alone.

export interface DismissCutoffJob {
  id: string;
  jobNumber: string;
}

export interface DismissCutoffDialogProps {
  open: boolean;
  job: DismissCutoffJob | null;
  /**
   * The job's cut-offs that are missed or overdue right now: `key` is the cut-off (closingDate, vgmClosing, …),
   * `label` what the row calls it. Empty: nothing to dismiss - the dialog shows the standing dismissals only.
   */
  cutoffs: { key: string; label: string }[];
  /** Closed with nothing changed. Also called after `onDone`. */
  onClose(): void;
  /** Something was changed and the dialog is closing: what was done last - a cut-off dismissed, or a dismissal taken back. */
  onDone(what?: DismissCutoffDone): void;
}

/** What the dialog did, as it tells its caller. */
export type DismissCutoffDone = "dismissed" | "taken_back";

export function DismissCutoffDialog({ open, job, cutoffs, onClose, onDone }: DismissCutoffDialogProps) {
  // Mounted anew each time it opens (and for each job).
  return open && job ? <Dialog key={job.id} job={job} cutoffs={cutoffs} onClose={onClose} onDone={onDone} /> : null;
}

function Dialog({ job, cutoffs, onClose, onDone }: Omit<DismissCutoffDialogProps, "open" | "job"> & { job: DismissCutoffJob }) {
  const { dismissals, isLoading, isError, dismiss, takeBack } = useCutoffDismissals(job.id, true);
  // What was dismissed while the dialog is open (cut-off → its dismissal): no longer offered, whether or not the
  // page behind has read the job again. Taking that dismissal back offers it again.
  const [dismissedNow, setDismissedNow] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [changed, setChanged] = useState<DismissCutoffDone | null>(null);
  // Opened with nothing to dismiss: the standing dismissals only, under their own title.
  const listOnly = cutoffs.length === 0;
  const reasonId = useId();

  const offered = cutoffs.filter((c) => !(c.key in dismissedNow));
  // With one cut-off there is nothing to pick.
  const cutoff = offered.length === 1 ? offered[0]!.key : offered.some((c) => c.key === picked) ? picked : null;
  const busy = dismiss.isPending || takeBack.isPending;

  const send = () => {
    if (!cutoff || !actionReasonOk(reason) || busy) return;
    setError("");
    setNote("");
    dismiss
      .mutateAsync({ cutoff, reason: reason.trim() })
      .then((d) => {
        setDismissedNow((now) => ({ ...now, [cutoff]: d.id }));
        setNote(`${dismissalTitle(d)} dismissed: it gives no signal while it keeps this date.`);
        setReason("");
        setPicked(null);
        setChanged("dismissed");
      })
      .catch((e) => setError(`Not dismissed: ${apiErrorMessage(e)}`));
  };
  const back = (d: CutoffDismissalItem) => {
    if (busy) return;
    setError("");
    setNote("");
    takeBack
      .mutateAsync(d.id)
      .then(() => {
        setDismissedNow((now) => Object.fromEntries(Object.entries(now).filter(([, id]) => id !== d.id)));
        setNote(`${dismissalTitle(d)} taken back: it counts again.`);
        setChanged("taken_back");
      })
      .catch((e) => setError(`Not taken back: ${apiErrorMessage(e)}`));
  };
  const close = () => {
    if (busy) return;
    if (changed) onDone(changed);
    onClose();
  };

  return (
    <Modal
      open
      title={
        listOnly ? (
          <>
            Dismissed cut-offs · <span className={REF}>{job.jobNumber || "the job"}</span>
          </>
        ) : (
          <>
            Missed cut-offs of <span className={REF}>{job.jobNumber || "the job"}</span>
          </>
        )
      }
      width={560}
      onCancel={close}
      maskClosable={!busy}
      destroyOnHidden
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} disabled={busy} className={BTN}>
            {changed ? "Done" : listOnly ? "Close" : "Cancel"}
          </button>
          {offered.length > 0 && (
            <button type="button" onClick={send} disabled={busy || !cutoff || !actionReasonOk(reason)} className={BTN_PRIMARY}>
              {dismiss.isPending ? "Dismissing…" : "Dismiss cut-off"}
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className={HINT}>
          A dismissed cut-off gives no signal on the Shipments list or on Shipments → Managers while its date stays the same; moved to another day, it counts as a new
          one.{listOnly ? " Taking a dismissal back makes the cut-off count again." : ""}
        </div>

        {listOnly ? null : offered.length === 0 ? (
          <div className="text-[13px] text-slate-700">No missed cut-off is left to dismiss on this job.</div>
        ) : (
          <>
            <div>
              <div className={`mb-1 ${LABEL_TEXT}`}>Cut-off to dismiss</div>
              {offered.length === 1 ? (
                <div className="text-[13px] font-semibold text-slate-900">{offered[0]!.label || cutoffName(offered[0]!.key)}</div>
              ) : (
                <Radio.Group
                  className="flex flex-col gap-1"
                  value={cutoff}
                  onChange={(e) => setPicked(e.target.value as string)}
                  disabled={busy}
                  options={offered.map((c) => ({ value: c.key, label: c.label || cutoffName(c.key) }))}
                />
              )}
            </div>
            <div>
              <label htmlFor={reasonId} className={`block mb-1 ${LABEL_TEXT}`}>
                Reason
              </label>
              <Input.TextArea
                id={reasonId}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
                autoSize={{ minRows: 2, maxRows: 4 }}
                maxLength={MAX_ACTION_REASON}
                placeholder="Why it is settled (went on the next vessel, the carrier accepted it late…)"
              />
              <div className={`${HINT} mt-1`}>At least {MIN_ACTION_REASON} characters. Kept in the job&apos;s history, with your name.</div>
            </div>
          </>
        )}

        <div aria-live="polite">
          {note && <div className="text-[13px] text-emerald-700">{note}</div>}
          {error && <div className="text-[13px] text-red-600">{error}</div>}
        </div>

        <div>
          {!listOnly && <div className={`mb-1 ${LABEL_TEXT}`}>Dismissed on this job</div>}
          {isError ? (
            <div className="text-[13px] text-red-600">The dismissed cut-offs could not be read.</div>
          ) : isLoading ? (
            <div className={HINT}>Loading…</div>
          ) : dismissals.length === 0 ? (
            <div className={listOnly ? "text-[13px] text-slate-700" : HINT}>Nothing is dismissed on this job</div>
          ) : (
            <ul className="m-0 p-0 list-none rounded-lg border border-slate-200 divide-y divide-slate-100">
              {dismissals.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-slate-900">{dismissalTitle(d)}</div>
                    <div className="text-[13px] text-slate-700 whitespace-pre-wrap [overflow-wrap:anywhere]">{d.reason}</div>
                    <div className={`${HINT} tabular-nums`}>
                      {d.dismissedByName || "A manager"} · {businessDateTime(d.dismissedAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => back(d)}
                    disabled={busy}
                    className={`${LINK} shrink-0 whitespace-nowrap text-[12px] font-medium cursor-pointer bg-transparent border-none p-0 disabled:opacity-50`}
                  >
                    Take back
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
