"use client";

import { useId, useState } from "react";
import { Input, Modal, Radio } from "antd";
import { UserPicker } from "@/components/UserPicker";
import { useHandOver, type HandOverResult } from "@/hooks/useShipmentManagerActions";
import { apiErrorMessage } from "@/lib/api";
import {
  actionReasonOk,
  handOverChanging,
  handOverPreview,
  handOverProblem,
  handOverRequest,
  handOverResultText,
  handOverTarget,
  MAX_ACTION_REASON,
  MIN_ACTION_REASON,
  type CoverChoice,
  type HandOverFieldChange,
  type HandOverJob,
} from "@/lib/managerActions";
import { BTN, BTN_PRIMARY, HINT, LABEL_TEXT, REF, TD, TH } from "@/styles/ui";

// Handing jobs over (Council Outlay 11, D11): a manager gives the jobs of somebody who is ill, on holiday or gone
// a new Handled By, a Holiday Cover, or both - one job from its row, or the ticked ones together. The dialog shows
// what will change before it is sent, and afterwards what the server did: a job it left as it was (already so,
// locked, not found) is named with the server's reason. Each job is changed as an edit of the two fields on the
// job itself changes it, so its history and the bell of whoever now covers it are the same.

export interface HandOverDialogProps {
  open: boolean;
  /** The jobs to hand over, with their people as stored. */
  jobs: HandOverJob[];
  /** The people the cockpit knows in Handled By: one who is not a user (`isUser` false) is marked so. */
  people: { handledBy: string; isUser: boolean | null }[];
  /** A line over the preview about which jobs these are (a person's all: "200 of 240 active jobs…"). */
  note?: string;
  /** The title, when the jobs are named otherwise than by how many ("Hand over the jobs of jan@firma.cz"). */
  title?: string;
  /** Closed without a hand-over. Also called after `onDone`, when the result is closed. */
  onClose(): void;
  /** The hand-over was made and its result has been read (the dialog is closing). */
  onDone(result: HandOverResult): void;
}

export function HandOverDialog({ open, ...props }: HandOverDialogProps) {
  // Mounted anew each time it opens: nothing of the last hand-over is left in it.
  return open ? <Dialog {...props} /> : null;
}

const HEAD = `${TH} !px-3 sticky top-0 bg-white`;
const CELL = `${TD} !px-3 !align-top`;

function Dialog({ jobs, people, note, title: named, onClose, onDone }: Omit<HandOverDialogProps, "open">) {
  const handOver = useHandOver();
  const [handledBy, setHandledBy] = useState("");
  const [cover, setCover] = useState<CoverChoice>("leave");
  const [holidayCover, setHolidayCover] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<HandOverResult | null>(null);
  const [error, setError] = useState("");
  const handledById = useId();
  const reasonId = useId();

  const choice = { handledBy, cover, holidayCover };
  const target = handOverTarget(choice);
  const problem = handOverProblem(choice, jobs.length);
  const rows = handOverPreview(jobs, target);
  const changing = handOverChanging(rows);
  const sending = handOver.isPending;
  const notUsers = new Set(people.filter((p) => p.isUser === false).map((p) => p.handledBy.trim().toLowerCase()));

  const send = () => {
    if (problem || !actionReasonOk(reason) || sending) return;
    setError("");
    handOver
      .mutateAsync(handOverRequest(jobs, target, reason))
      .then(setResult)
      .catch((e) => setError(apiErrorMessage(e)));
  };
  const close = () => {
    if (sending) return;
    if (result) onDone(result);
    onClose();
  };

  const person = (value: string) =>
    value ? (
      <>
        {value}
        {notUsers.has(value.toLowerCase()) && <span className="text-amber-700"> (not a user)</span>}
      </>
    ) : (
      "nobody"
    );
  const field = (change: HandOverFieldChange | null, now: string) =>
    change ? (
      <>
        <span className="text-slate-500">{person(change.from)}</span> → <span className="font-semibold text-slate-900">{change.to || "nobody"}</span>
      </>
    ) : (
      <span className="text-slate-400">{person(now.trim())}</span>
    );

  const title = named ?? `Hand over ${jobs.length === 1 ? (jobs[0]!.jobNumber || "1 job") : `${jobs.length} jobs`}`;

  if (result) {
    return (
      <Modal
        open
        title={title}
        width={640}
        onCancel={close}
        destroyOnHidden
        footer={
          <div className="flex justify-end">
            <button type="button" onClick={close} className={BTN_PRIMARY}>
              Done
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-3" aria-live="polite">
          <div className="text-[13px] font-semibold text-slate-900">{handOverResultText(result)}.</div>
          {result.skipped.length > 0 && (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className={HEAD}>Left as it was</th>
                    <th className={HEAD}>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {result.skipped.map((s) => (
                    <tr key={s.shipmentId}>
                      <td className={`${CELL} ${REF} font-semibold whitespace-nowrap`}>{s.jobNumber || "—"}</td>
                      <td className={CELL}>{s.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.changed > 0 && <div className={HINT}>The hand-over and its reason are in each job&apos;s history; whoever now covers a job is told under the bell.</div>}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      title={title}
      width={720}
      onCancel={close}
      maskClosable={!sending}
      destroyOnHidden
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} disabled={sending} className={BTN}>
            Cancel
          </button>
          <button type="button" onClick={send} disabled={sending || !!problem || !actionReasonOk(reason) || changing === 0} className={BTN_PRIMARY}>
            {sending ? "Handing over…" : `Hand over ${changing} job${changing === 1 ? "" : "s"}`}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={handledById} className={`block mb-1 ${LABEL_TEXT}`}>
              New Handled By
            </label>
            <UserPicker id={handledById} className="w-full" value={handledBy} onChange={setHandledBy} placeholder="Leave as it is" disabled={sending} />
            <div className={`${HINT} mt-1`}>One of the company&apos;s users. Left empty, Handled By stays as it is.</div>
          </div>
          <div>
            <div className={`mb-1 ${LABEL_TEXT}`}>Holiday Cover</div>
            <Radio.Group
              value={cover}
              onChange={(e) => setCover(e.target.value as CoverChoice)}
              disabled={sending}
              options={[
                { value: "leave", label: "Leave as it is" },
                { value: "set", label: "Set to…" },
                { value: "clear", label: "Clear" },
              ]}
            />
            {cover === "set" && (
              <UserPicker className="w-full mt-2" aria-label="Holiday Cover" value={holidayCover} onChange={setHolidayCover} placeholder="Pick who covers" disabled={sending} />
            )}
          </div>
        </div>

        <div>
          <label htmlFor={reasonId} className={`block mb-1 ${LABEL_TEXT}`}>
            Reason
          </label>
          <Input.TextArea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={sending}
            autoSize={{ minRows: 2, maxRows: 4 }}
            maxLength={MAX_ACTION_REASON}
            placeholder="Why the jobs are handed over (ill, on holiday, left the company…)"
          />
          <div className={`${HINT} mt-1`}>At least {MIN_ACTION_REASON} characters. Kept in each job&apos;s history, with your name.</div>
        </div>

        <div>
          <div className={`mb-1 ${LABEL_TEXT}`}>What will change</div>
          {note && <div className={`${HINT} mb-2`}>{note}</div>}
          {problem ? (
            <div className={HINT}>{problem}.</div>
          ) : (
            <>
              <div className="text-[13px] text-slate-700 mb-2">
                {changing} of {jobs.length} job{jobs.length === 1 ? "" : "s"} will change
                {changing < jobs.length ? ` — ${jobs.length - changing} ${jobs.length - changing === 1 ? "is" : "are"} already so and stay${jobs.length - changing === 1 ? "s" : ""} as ${jobs.length - changing === 1 ? "it is" : "they are"}` : ""}.
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr>
                      <th className={HEAD}>Job</th>
                      <th className={HEAD}>Handled By</th>
                      <th className={HEAD}>Holiday Cover</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.job.id}>
                        <td className={`${CELL} ${REF} font-semibold whitespace-nowrap`}>{r.job.jobNumber || "—"}</td>
                        <td className={`${CELL} [overflow-wrap:anywhere]`}>{field(r.handledBy, r.job.handledBy)}</td>
                        <td className={`${CELL} [overflow-wrap:anywhere]`}>{field(r.holidayCover, r.job.holidayCover)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div aria-live="polite">{error && <div className="text-[13px] text-red-600">Not handed over: {error}</div>}</div>
      </div>
    </Modal>
  );
}
