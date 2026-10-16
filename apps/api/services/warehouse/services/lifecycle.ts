// The in-and-out lifecycle of a position: ONE derivation from its stamps, the stripping tally and
// the stuffing of its container, shown on Positions, the gate job, floor mode and History; Stock on
// Hand opens its line at the same receipt (warehouseStockPlan.ts) and the storage clock starts
// there too (storage.ts). Pure, no imports from the services (no import cycle). Nothing here is stored.
//
//   inbound (příjem, export cargo arriving by truck)
//     Expected → Arrived (gate-in / draft receipt) → Received (WH receipt) → In warehouse
//     → Stuffed (in an export container) → Left (that container's gate-out, or the WH release)
//   domestic (příjem, Trucking's LTL through our hub — the gate-in IS the receipt)
//     Expected → Received (gate-in: arrived, received and in the warehouse at once)
//     → Ready for release (release box armed) → Left (WH release)
//   outbound (výdej, import cargo stripped from a container, leaving by truck)
//     Expected → Arrived (its container's gate-in; without a container the received date)
//     → Received (ticked off at the stripping tally; without a container the received date)
//     → In warehouse → Ready for release (release box armed) → Left (WH release)
//   A refusal is a flag next to the stage, not a stage.

export type LifecycleStage = "expected" | "arrived" | "received" | "in_warehouse" | "stuffed" | "ready" | "left";

export const LIFECYCLE_LABEL: Record<LifecycleStage, string> = {
  expected: "Expected",
  arrived: "Arrived",
  received: "Received",
  in_warehouse: "In warehouse",
  stuffed: "Stuffed",
  ready: "Ready for release",
  left: "Left",
};

export interface LifecycleStep {
  stage: LifecycleStage;
  label: string;
  /** ISO time, or a YYYY-MM-DD day (the received date typed by hand); null when not reached or timeless. */
  at: string | null;
  done: boolean;
}

export interface PositionLifecycle {
  stage: LifecycleStage;
  label: string;
  /** When the current stage was reached (as in `steps`). */
  at: string | null;
  refused: boolean;
  steps: LifecycleStep[];
}

export interface LifecycleMovement {
  visit: string;
  /** Import / Export / Domestic; Domestic cargo is received at its gate-in. */
  handling?: string;
  status: string;
  createdAt: Date;
  gateIn: Date | null;
  expDraft: Date | null;
  expReceipt: Date | null;
  impRelease: Date | null;
  loadInDate: string;
  receivedAt: Date | null;
  leftAt: Date | null;
}

export interface LifecycleLink {
  stuffedAt: Date | null;
  tickedAt: Date | null;
  tallyOutcome: string;
  /** Gate-in of the container the house is in. */
  containerGateInAt: Date | null;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The position's lifecycle; `armed` is the release box (isArmed), `link` its container house. */
export function positionLifecycle(m: LifecycleMovement, armed: boolean, link?: LifecycleLink | null): PositionLifecycle {
  const step = (stage: LifecycleStage, at: string | null, done: boolean): LifecycleStep => ({ stage, label: LIFECYCLE_LABEL[stage], at: done ? at : null, done });
  const manualDate = DATE.test(m.loadInDate) ? m.loadInDate : null;
  let steps: LifecycleStep[];
  if (m.visit !== "výdej" && m.handling === "Domestic") {
    // The gate-in is the receipt (a draft receipt / receipt kept from before still counts).
    const received = iso(m.gateIn ?? m.expReceipt);
    const left = iso(m.leftAt ?? m.impRelease);
    steps = [
      step("expected", iso(m.createdAt), true),
      step("arrived", received, !!received),
      step("received", received, !!received),
      step("in_warehouse", received, !!received),
      ...(link ? [step("stuffed", iso(link.stuffedAt), !!link.stuffedAt)] : []),
      step("ready", null, !!left || (!!received && armed)),
      step("left", left, !!left),
    ];
  } else if (m.visit !== "výdej") {
    const arrived = iso(m.gateIn ?? m.expDraft);
    const received = iso(m.expReceipt);
    const left = iso(m.leftAt ?? m.impRelease);
    steps = [
      step("expected", iso(m.createdAt), true),
      step("arrived", arrived, !!arrived || !!received),
      step("received", received, !!received),
      step("in_warehouse", received, !!received),
      ...(link ? [step("stuffed", iso(link.stuffedAt), !!link.stuffedAt)] : []),
      step("left", left, !!left),
    ];
  } else {
    // With a container the tally is the receipt; the typed date counts only without one.
    const arrived = link ? iso(link.containerGateInAt) : manualDate;
    const received = link ? iso(m.receivedAt) : (iso(m.receivedAt) ?? manualDate);
    const left = iso(m.impRelease);
    steps = [
      step("expected", iso(m.createdAt), true),
      step("arrived", arrived ?? received, !!arrived || !!received),
      step("received", received, !!received),
      step("in_warehouse", received, !!received),
      step("ready", null, !!left || (!!received && armed)),
      step("left", left, !!left),
    ];
  }
  const current = [...steps].reverse().find((s) => s.done) ?? steps[0]!;
  return { stage: current.stage, label: current.label, at: current.at, refused: m.status === "Refused", steps };
}
