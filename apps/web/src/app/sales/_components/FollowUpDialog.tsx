"use client";

import { useState } from "react";
import { Alert, Button, Form, Input } from "antd";
import { businessDateTime } from "@/lib/date";
import { isFeedbackLine } from "../_lib/salesQuote";
import type { TimelineEntry } from "../_lib/types";
import { QuoteStatusPill } from "./QuoteStatusPill";
import { SalesDialog } from "./SalesDialog";

// The longest note the server takes (MAX_FOLLOW_UP_NOTE in the API's quoteLifecycle.utils.ts).
const MAX_NOTE_LENGTH = 2000;

interface FollowUpDialogProps {
  quoteNumber: string;
  // The follow-ups already recorded on the quote and its changes to Feedback, newest first (followUpLines).
  history: TimelineEntry[];
  onRecord: (note?: string) => Promise<string | null>;
  onClose: () => void;
}

// What "Followed up" opens: the user's word that the customer was contacted about a quote, with a
// note for the quote's history if they want to leave one. The follow-up flag then stays off for
// three days. `onRecord` asks the server for it and resolves with why it was refused - a sentence
// that finishes "QCZ… - …" - or with null once it is recorded; a refusal is shown here, with the
// note still there. Whoever opens the dialog keeps it outside the row or card of the button: a
// refusal usually means the quote has just left that list or lost that card, and the dialog must
// not go with it before the reason was read. Under the note, the follow-ups recorded before.
export function FollowUpDialog({
  quoteNumber,
  history,
  onRecord,
  onClose,
}: FollowUpDialogProps) {
  const [note, setNote] = useState("");
  // The request is on its way: the dialog waits for the server's answer.
  const [recording, setRecording] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const record = async () => {
    setRecording(true);
    setRefusal(null);
    const refused = await onRecord(note.trim() || undefined);
    setRecording(false);
    if (refused) setRefusal(refused);
    else onClose();
  };

  return (
    <SalesDialog
      open
      onClose={onClose}
      busy={recording}
      title={`Followed up on ${quoteNumber}`}
      subtitle="Records that the customer was contacted just now. The quote is not flagged for a follow-up for the next three days."
      footer={
        <>
          <Button disabled={recording} onClick={onClose}>
            Cancel
          </Button>
          <Button type="primary" loading={recording} onClick={record}>
            Record follow-up
          </Button>
        </>
      }
    >
      {refusal && (
        <div className="mb-4">
          <Alert type="error" showIcon message={`${quoteNumber} - ${refusal}`} />
        </div>
      )}
      <Form layout="vertical" disabled={recording}>
        <Form.Item label="Note (optional)" className="!mb-0">
          <Input.TextArea
            rows={3}
            maxLength={MAX_NOTE_LENGTH}
            placeholder="What was said or agreed - it goes into the quote's history"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Form.Item>
      </Form>
      <FollowUpHistory history={history} />
    </SalesDialog>
  );
}

// The follow-ups recorded before, newest first: when, who, and the first line of the note. A change
// of the status to Feedback is one too, tagged as such, with the comment left on it. A note that
// is cut opens in full on a click, and closes again on another.
function FollowUpHistory({ history }: { history: TimelineEntry[] }) {
  // The lines whose note is shown in full, by their place in the list.
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="mt-5">
      <div className="mb-2 text-sm font-medium text-slate-700">
        Earlier follow-ups{history.length > 0 && <span className="ml-1 font-normal text-slate-500">({history.length})</span>}
      </div>
      {history.length === 0 ? (
        <div className="text-xs text-slate-500">No follow-up recorded yet</div>
      ) : (
        <ul className="max-h-60 overflow-y-auto divide-y divide-slate-100 rounded-md border border-slate-200">
          {history.map((entry, i) => {
            const expanded = open.has(i);
            const head = (
              <div className="flex items-baseline gap-2 text-xs">
                <span className="font-medium text-slate-700 tabular-nums whitespace-nowrap">{businessDateTime(entry.at)}</span>
                {entry.user && <span className="truncate text-slate-500">{entry.user}</span>}
                {isFeedbackLine(entry) && (
                  <span className="ml-auto shrink-0">
                    <QuoteStatusPill status="feedback" />
                  </span>
                )}
              </div>
            );
            if (!entry.comment) {
              return (
                <li key={i} className="px-3 py-2">
                  {head}
                  <div className="mt-0.5 text-xs italic text-slate-400">No note</div>
                </li>
              );
            }
            return (
              <li key={i}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                  aria-expanded={expanded}
                  title={expanded ? "Click to collapse" : "Click to see the full note"}
                  onClick={() => toggle(i)}
                >
                  {head}
                  <div className={`mt-0.5 text-sm text-slate-700 ${expanded ? "whitespace-pre-wrap break-words" : "truncate"}`}>{entry.comment}</div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
