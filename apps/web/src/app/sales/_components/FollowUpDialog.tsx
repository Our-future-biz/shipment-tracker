"use client";

import { useState } from "react";
import { Alert, Button, Form, Input } from "antd";
import { SalesDialog } from "./SalesDialog";

// The longest note the server takes (MAX_FOLLOW_UP_NOTE in the API's quoteLifecycle.utils.ts).
const MAX_NOTE_LENGTH = 2000;

// What "Followed up" opens: the user's word that the customer was contacted about a quote, with a
// note for the quote's history if they want to leave one. The follow-up flag then stays off for
// three days. `onRecord` asks the server for it and resolves with why it was refused - a sentence
// that finishes "QCZ… - …" - or with null once it is recorded; a refusal is shown here, with the
// note still there. Whoever opens the dialog keeps it outside the row or card of the button: a
// refusal usually means the quote has just left that list or lost that card, and the dialog must
// not go with it before the reason was read.
export function FollowUpDialog({
  quoteNumber,
  onRecord,
  onClose,
}: {
  quoteNumber: string;
  onRecord: (note?: string) => Promise<string | null>;
  onClose: () => void;
}) {
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
    </SalesDialog>
  );
}
