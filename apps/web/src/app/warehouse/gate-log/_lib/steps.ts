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

// Release-gate line set by the PIN check at the gate, never by hand. Must match the API's
// PICKUP_PIN_GATE (apps/api/services/warehouse/services/pickupPin.ts).
export const PICKUP_PIN_GATE = "Pick-up PIN verified";
export const MAX_PIN_TRIES = 3;

export type PinCheckResult = "match" | "no_match" | "locked" | "no_pin";

/** What the clerk sees after a PIN check: the tone and the words. */
export function pinCheckMessage(result: PinCheckResult, tries: number): { tone: "g" | "a" | "r"; text: string } {
  switch (result) {
    case "match":
      return { tone: "g", text: `Match — ${PICKUP_PIN_GATE} is OK` };
    case "no_match": {
      const left = Math.max(0, MAX_PIN_TRIES - tries);
      return { tone: "a", text: `No match — ${left} ${left === 1 ? "try" : "tries"} left` };
    }
    case "locked":
      return { tone: "r", text: "Locked after 3 wrong tries — ask operations for a new PIN in Shipments → Warehouse → Pick-up" };
    case "no_pin":
      return { tone: "r", text: "No pick-up PIN yet — operations make it in Shipments → Warehouse → Pick-up" };
  }
}

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

const sameTime = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && new Date(a).getTime() === new Date(b).getTime();

// Why a done step cannot be voided as the record is now; null when it can. Later steps are voided
// first (same rules as the server): the receipt before its draft, everything after the gate-in
// before the gate-in, an outgoing gate-out before its WH release. Voiding the WH release also
// voids the gate-out stamped with it; that gate-out is never voided on its own.
export function voidBlocked(m: Pick<interfaces.GateMovementItem, StepKind> & { visit?: string }, kind: StepKind): string | null {
  if (!m[kind]) return "Not stamped";
  switch (kind) {
    case "gateOut":
      return sameTime(m.gateOut, m.impRelease) ? `The ${TERMS.gateOut} was stamped with the ${TERMS.whRelease} — void the ${TERMS.whRelease} instead` : null;
    case "impRelease":
      return m.visit === "výdej" && m.gateOut && !sameTime(m.gateOut, m.impRelease) ? `Void the ${TERMS.gateOut} first` : null;
    case "gateIn":
      if (m.expReceipt || m.expDraft) return `Void the ${TERMS.receipt} and the ${TERMS.draftReceipt} first`;
      if (m.impRelease) return `Void the ${TERMS.whRelease} first`;
      if (m.gateOut) return `Void the ${TERMS.gateOut} first`;
      return null;
    case "expDraft":
      return m.expReceipt ? `Void the ${TERMS.receipt} first` : null;
    default:
      return null;
  }
}

/** The gate-out goes with a voided WH release when both were stamped at the same moment. */
export const voidsGateOutToo = (m: Pick<interfaces.GateMovementItem, "impRelease" | "gateOut">, kind: StepKind) =>
  kind === "impRelease" && sameTime(m.gateOut, m.impRelease);

// ─── Stamp confirmation (gate job and floor mode) ──────────────

type StampFields = Pick<interfaces.GateMovementItem, "visit" | "gateIn" | "impRelease">;

/**
 * What the stamp writes to the linked shipment, for the confirmation text; null when nothing.
 * Only inbound arrival is a receipt; an outbound gate-in is the pickup truck.
 */
export function writesBack(m: StampFields, kind: StepKind): string | null {
  if (!isOutbound(m) && (kind === "gateIn" || ((kind === "expDraft" || kind === "expReceipt") && !m.gateIn))) return "received date";
  if (kind === "impRelease" || (kind === "gateOut" && isOutbound(m))) return "released date and plate";
  return null;
}

/** The confirmation text of a stamp: stamps are final, and some set the linked shipment's dates. */
export function stampConfirmText(m: StampFields & { gateRef: string }, kind: StepKind, label: string): string {
  const back = writesBack(m, kind);
  return `Stamp the ${label} on ${m.gateRef}? The stamp cannot be taken back${back ? ` and sets the linked shipment's ${back} (if any)` : ""}.`;
}

/**
 * Why a picked stamp is not asked for at all (an info message), or null to go on and confirm it:
 * an already stamped step is not an error (the stamp is final), and outbound cargo leaves
 * through the WH release, which stamps the gate-out too.
 */
export function stampPrecheck(m: StampFields, kind: StepKind, label: string, at: string | null, fmt: (iso: string) => string): string | null {
  if (at) return `${label} was already stamped ${fmt(at)}`;
  if (kind === "gateOut" && isOutbound(m) && !m.impRelease) return `Outbound cargo leaves through ${TERMS.whRelease} — it stamps the gate-out too.`;
  return null;
}

/**
 * Stamps a phone may record without a connection (floor mode) and send later: the gate-in, the
 * draft receipt, the receipt and the gate-out of inbound cargo. The WH release (and the outbound
 * gate-out it stamps) needs the server's answer — release gates and the PIN — so never waits.
 */
export const QUEUEABLE_STAMPS: readonly StepKind[] = ["gateIn", "expDraft", "expReceipt", "gateOut"];
export const isQueueableStamp = (m: Pick<interfaces.GateMovementItem, "visit">, kind: StepKind) =>
  QUEUEABLE_STAMPS.includes(kind) && !(kind === "gateOut" && isOutbound(m));
