import type { interfaces } from "@/lib/api/client";
import { TERMS } from "../../_lib/glossary";

// The gate stamps as steps in process order, per direction:
//   inbound (příjem):  Gate-in → Draft receipt → Receipt → Gate-out
//   outbound (výdej):  Gate-in (truck) → WH release → Gate-out (stamped with the WH release)
// Done steps carry the stamp time and who stamped it (from the movement's events). The first
// step not done is the next one; later steps wait for the one before. A refused movement takes
// no stamps here, and WH release waits for the release gates to be clear.

export type StepKind = "gateIn" | "gateOut" | "impRelease" | "expDraft" | "expReceipt";
export type StepState = "done" | "next" | "later" | "blocked";
export type GateStep = {
  kind: StepKind;
  label: string;
  state: StepState;
  at: string | null;
  by: string;
  /** Why the step cannot be taken now (later / blocked). */
  reason: string;
  /** Extra line for a done step (e.g. stamped together with another one). */
  note?: string;
  /** A stamp of the other direction, kept from before; shown greyed out. */
  legacy?: boolean;
};

type StepMovement = Pick<
  interfaces.GateMovementItem,
  "visit" | "status" | "armed" | "releaseGates" | "gateIn" | "gateOut" | "impRelease" | "expDraft" | "expReceipt" | "events"
>;

const isEmptyReturn = (g: string) => /empty return/i.test(g);

/** Release gates that still hold the release (the empty return never does). */
export const waitingGates = (m: Pick<interfaces.GateMovementItem, "releaseGates">) =>
  m.releaseGates.filter((x) => x.s !== "OK" && !isEmptyReturn(x.g)).map((x) => x.g);

export const isOutbound = (m: Pick<interfaces.GateMovementItem, "visit">) => m.visit === "výdej";

const SEQUENCE: Record<"in" | "out", { kind: StepKind; label: string }[]> = {
  in: [
    { kind: "gateIn", label: TERMS.gateIn },
    { kind: "expDraft", label: TERMS.draftReceipt },
    { kind: "expReceipt", label: TERMS.receipt },
    { kind: "gateOut", label: TERMS.gateOut },
  ],
  out: [
    { kind: "gateIn", label: TERMS.gateInTruck },
    { kind: "impRelease", label: TERMS.whRelease },
    { kind: "gateOut", label: TERMS.gateOut },
  ],
};
const LEGACY: Record<"in" | "out", { kind: StepKind; label: string }[]> = {
  in: [{ kind: "impRelease", label: TERMS.whRelease }],
  out: [
    { kind: "expDraft", label: TERMS.draftReceipt },
    { kind: "expReceipt", label: TERMS.receipt },
  ],
};

export function gateSteps(m: StepMovement): GateStep[] {
  const dir = isOutbound(m) ? "out" : "in";
  const lastEvent = (kind: string) => [...m.events].reverse().find((e) => e.kind === kind);
  const refused = m.status === "Refused";
  let seenOpen = false;

  const steps = SEQUENCE[dir].map(({ kind, label }, i): GateStep => {
    const at = m[kind];
    if (at) {
      let evt = lastEvent(kind);
      let note: string | undefined;
      // Outbound gate-out is stamped by the WH release; there is no gate-out event of its own.
      if (!evt && kind === "gateOut" && dir === "out") {
        evt = lastEvent("impRelease");
        note = `Stamped with ${TERMS.whRelease}`;
      }
      return { kind, label, state: "done", at, by: evt?.by ?? "", reason: "", note };
    }
    if (refused) return { kind, label, state: "blocked", at: null, by: "", reason: `Refused — see ${TERMS.releaseGates}` };
    if (seenOpen) {
      const prev = SEQUENCE[dir][i - 1]!;
      return { kind, label, state: "later", at: null, by: "", reason: `Stamp ${prev.label} first` };
    }
    seenOpen = true;
    if (kind === "impRelease" && !m.armed) {
      return {
        kind,
        label,
        state: "blocked",
        at: null,
        by: "",
        reason: `${TERMS.releaseGates} ${TERMS.blocked.toLowerCase()} — waiting for: ${waitingGates(m).join(", ") || "—"}`,
      };
    }
    return { kind, label, state: "next", at: null, by: "", reason: "" };
  });

  const legacy = LEGACY[dir].flatMap(({ kind, label }): GateStep[] => {
    const at = m[kind];
    return at
      ? [{ kind, label, state: "done", at, by: lastEvent(kind)?.by ?? "", reason: "", note: "Stamp of the other direction, kept from before", legacy: true }]
      : [];
  });
  return [...steps, ...legacy];
}
