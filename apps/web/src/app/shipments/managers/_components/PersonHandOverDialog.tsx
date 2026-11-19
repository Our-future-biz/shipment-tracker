"use client";

import { useState } from "react";
import { Modal } from "antd";
import { useHandOverJobs, type HandOverResult } from "@/hooks/useShipmentManagerActions";
import { handOverAllNote, type HandOverTarget } from "@/lib/managerActions";
import { BTN, HINT } from "@/styles/ui";
import { HandOverDialog } from "./HandOverDialog";

// "Hand over all N active jobs…" on a Team row (Council Outlay 11, D11; X9): somebody is ill, on holiday or gone,
// and every active job they handle goes to somebody else - the quiet ones too, which the cockpit's cards never show.
// "Replace as Holiday Cover on M jobs…" (P12) does the same for the jobs they cover: only the cover is changed.
// The server lists the jobs (at most 200, the oldest first, with how many there are), and the same hand-over dialog
// as a card row's shows what will change and asks the reason; it sends to the same POST /shipments/hand-over. Once
// a new Handled By or cover is chosen, the jobs are listed anew - only those it changes (n25) - so the jobs past the
// first 200 are reached when those are already so: a cover alone given to 240 jobs, 200 of which have it already.

export interface PersonHandOverDialogProps {
  /** Whose jobs: the e-mail Handled By names - or, `as: "holidayCover"`, the one Holiday Cover names; null while closed. */
  handledBy: string | null;
  /** The jobs the person handles (the default), or those they cover. */
  as?: "handledBy" | "holidayCover";
  /** The mode and direction the Team tab shows: the jobs are listed in them, as the row counted them. */
  filter: { mode: string; direction: string };
  /** The mode and direction in words ("Sea · Import"), "" for all. */
  scope: string;
  people: { handledBy: string; isUser: boolean | null }[];
  onClose(): void;
  onDone(result: HandOverResult): void;
}

export function PersonHandOverDialog({ handledBy, as = "handledBy", ...props }: PersonHandOverDialogProps) {
  // Mounted anew for each person: the list is read when it opens.
  return handledBy ? <Loaded key={`${as}:${handledBy}`} handledBy={handledBy} as={as} {...props} /> : null;
}

function Loaded({ handledBy, as, filter, scope, people, onClose, onDone }: Omit<PersonHandOverDialogProps, "handledBy" | "as"> & { handledBy: string; as: "handledBy" | "holidayCover" }) {
  const [target, setTarget] = useState<HandOverTarget | null>(null);
  const { listed, isLoading, isRelisting, isError } = useHandOverJobs(handledBy, filter, { as, to: target });
  const cover = as === "holidayCover";
  const title = cover ? `Replace ${handledBy} as Holiday Cover` : `Hand over the jobs of ${handledBy}`;

  // Before anything is chosen: still reading, could not read, or nothing left (handed over meanwhile). Once a choice
  // is made the dialog stays, with the jobs it changes - none, when they are all so already.
  if (!target && (!listed || listed.jobs.length === 0)) {
    const none = cover ? `No active job has ${handledBy} as Holiday Cover` : `No active job has ${handledBy} in Handled By`;
    const said = isLoading ? "Loading the jobs…" : isError ? "The jobs could not be loaded. Close and try again." : `${none}${scope ? ` (${scope})` : ""} any more.`;
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

  const shown = listed ?? { jobs: [], total: 0 };
  return (
    <HandOverDialog
      open
      title={title}
      jobs={shown.jobs}
      people={people}
      note={isError ? "The jobs this changes could not be listed. Close and try again." : handOverAllNote(shown, handledBy, scope, { as, changing: !!target })}
      coverOnly={cover}
      onTargetChange={setTarget}
      relisting={isRelisting || (!!target && isError)}
      onClose={onClose}
      onDone={onDone}
    />
  );
}
