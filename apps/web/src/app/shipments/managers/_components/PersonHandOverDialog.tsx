"use client";

import { Modal } from "antd";
import { useHandOverJobs, type HandOverResult } from "@/hooks/useShipmentManagerActions";
import { handOverAllNote } from "@/lib/managerActions";
import { BTN, HINT } from "@/styles/ui";
import { HandOverDialog } from "./HandOverDialog";

// "Hand over all N active jobs…" on a Team row (Council Outlay 11, D11; X9): somebody is ill, on holiday or gone,
// and every active job they handle goes to somebody else - the quiet ones too, which the cockpit's cards never show.
// The server lists them (at most 200, the oldest first, with how many there are), and the same hand-over dialog as
// a card row's shows what will change and asks the reason; it sends to the same POST /shipments/hand-over.

export interface PersonHandOverDialogProps {
  /** Whose jobs: the e-mail Handled By names; null while closed. */
  handledBy: string | null;
  /** The mode and direction the Team tab shows: the jobs are listed in them, as the row counted them. */
  filter: { mode: string; direction: string };
  /** The mode and direction in words ("Sea · Import"), "" for all. */
  scope: string;
  people: { handledBy: string; isUser: boolean | null }[];
  onClose(): void;
  onDone(result: HandOverResult): void;
}

export function PersonHandOverDialog({ handledBy, ...props }: PersonHandOverDialogProps) {
  // Mounted anew for each person: the list is read when it opens.
  return handledBy ? <Loaded key={handledBy} handledBy={handledBy} {...props} /> : null;
}

function Loaded({ handledBy, filter, scope, people, onClose, onDone }: Omit<PersonHandOverDialogProps, "handledBy"> & { handledBy: string }) {
  const { listed, isLoading, isError } = useHandOverJobs(handledBy, filter);
  const title = `Hand over the jobs of ${handledBy}`;

  if (!listed || listed.jobs.length === 0) {
    // Still reading, could not read, or nothing left to hand over (handed over meanwhile).
    const said = isLoading ? "Loading the jobs…" : isError ? "The jobs could not be loaded. Close and try again." : `No active job has ${handledBy} in Handled By${scope ? ` (${scope})` : ""} any more.`;
    return (
      <Modal
        open
        title={title}
        width={560}
        onCancel={onClose}
        destroyOnHidden
        footer={
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className={BTN}>
              Close
            </button>
          </div>
        }
      >
        <div aria-live="polite" className={isError ? "text-[13px] text-red-600" : HINT}>
          {said}
        </div>
      </Modal>
    );
  }

  return (
    <HandOverDialog
      open
      title={title}
      jobs={listed.jobs}
      people={people}
      note={handOverAllNote(listed, handledBy, scope)}
      onClose={onClose}
      onDone={onDone}
    />
  );
}
