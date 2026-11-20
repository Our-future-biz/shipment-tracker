"use client";

import { useId, useState } from "react";
import { DatePicker, Input, Modal } from "antd";
import dayjs from "dayjs";
import { useNudge, type NudgeResult } from "@/hooks/useShipmentManagerActions";
import { apiErrorMessage } from "@/lib/api";
import { businessToday, formatDate } from "@/lib/date";
import { nextWorkingDay, NUDGE_MAX_TEXT, nudgeProblem, nudgeToldText } from "@/lib/managerActions";
import { nameOf } from "@/app/shipments/_lib/personNames";
import { usePeopleNames } from "@/app/shipments/_lib/usePeopleNames";
import { BTN, BTN_PRIMARY, HINT, LABEL_TEXT, REF } from "@/styles/ui";

// A manager's nudge (Council Outlay 11, D17): a to-do on the job with a due date, and a line in the job's chat
// that tags its Handled By and Holiday Cover, so it is under their bell and stays unread until they open the
// chat. No e-mail. Afterwards the dialog says who was told. The server refuses a nudge nobody could be told of
// ("Nobody on this job can be told: hand it over first") - its refusals are shown as they come.

export interface NudgeJob {
  id: string;
  jobNumber: string;
  /** The job's Handled By as stored: a nudge needs somebody there. */
  handledBy: string;
}

export interface NudgeDialogProps {
  open: boolean;
  job: NudgeJob | null;
  /** Closed without a nudge. Also called after `onDone`, when the result is closed. */
  onClose(): void;
  /** The nudge was made and its result has been read (the dialog is closing). */
  onDone(result: NudgeResult): void;
}

export function NudgeDialog({ open, job, onClose, onDone }: NudgeDialogProps) {
  // Mounted anew each time it opens (and for each job): a new text, and the due date offered from today.
  return open && job ? <Dialog key={job.id} job={job} onClose={onClose} onDone={onDone} /> : null;
}

function Dialog({ job, onClose, onDone }: { job: NudgeJob; onClose(): void; onDone(result: NudgeResult): void }) {
  const nudge = useNudge();
  const [today] = useState(businessToday);
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState(() => nextWorkingDay(today));
  const [result, setResult] = useState<NudgeResult | null>(null);
  const [error, setError] = useState("");
  const textId = useId();
  const dueId = useId();

  // By name where the user has one (user council x4).
  const names = usePeopleNames();
  const problem = nudgeProblem({ text, dueDate, handledBy: job.handledBy }, today);
  const nobody = !job.handledBy.trim();
  const sending = nudge.isPending;

  const send = () => {
    if (problem || sending) return;
    setError("");
    nudge
      .mutateAsync({ shipmentId: job.id, text: text.trim(), dueDate })
      .then(setResult)
      .catch((e) => setError(apiErrorMessage(e)));
  };
  const close = () => {
    if (sending) return;
    if (result) onDone(result);
    onClose();
  };

  const title = (
    <>
      Nudge <span className={REF}>{job.jobNumber || "the job"}</span>
    </>
  );

  if (result) {
    return (
      <Modal
        open
        title={title}
        width={480}
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
        <div className="flex flex-col gap-2" aria-live="polite">
          <div className="text-[13px] font-semibold text-slate-900">
            The to-do is on the job, due {formatDate(result.note.dueDate ?? dueDate)}.
          </div>
          <div className="text-[13px] text-slate-700 whitespace-pre-wrap">{result.note.text}</div>
          <div className="text-[13px] text-slate-700">{nudgeToldText(result.told)}.</div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      title={title}
      width={480}
      onCancel={close}
      maskClosable={!sending}
      destroyOnHidden
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} disabled={sending} className={BTN}>
            Cancel
          </button>
          <button type="button" onClick={send} disabled={sending || !!problem} className={BTN_PRIMARY}>
            {sending ? "Sending…" : "Nudge"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className={nobody ? "text-[13px] font-medium text-red-700" : HINT}>
          {nobody
            ? "Nobody is in Handled By on this job: name somebody in Handled By first."
            : `A to-do on the job and a line in its chat that tags ${nameOf(job.handledBy, names)} and the Holiday Cover, if there is one. No e-mail.`}
        </div>
        <div>
          <label htmlFor={textId} className={`block mb-1 ${LABEL_TEXT}`}>
            What has to be done
          </label>
          <Input.TextArea
            id={textId}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={sending || nobody}
            autoSize={{ minRows: 2, maxRows: 5 }}
            maxLength={NUDGE_MAX_TEXT}
            showCount
            placeholder="Send the SI to the carrier…"
          />
        </div>
        <div>
          <label htmlFor={dueId} className={`block mb-1 ${LABEL_TEXT}`}>
            Due
          </label>
          <DatePicker
            id={dueId}
            value={dueDate ? dayjs(dueDate) : null}
            onChange={(d) => setDueDate(d ? d.format("YYYY-MM-DD") : "")}
            format="DD.MM.YYYY"
            allowClear={false}
            disabled={sending || nobody}
            disabledDate={(d) => d.format("YYYY-MM-DD") < today}
          />
          <div className={`${HINT} mt-1`}>The next working day is offered; any day from today on can be picked.</div>
        </div>
        <div aria-live="polite">{error && <div className="text-[13px] text-red-600">Not sent: {error}</div>}</div>
      </div>
    </Modal>
  );
}
