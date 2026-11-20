import type { interfaces } from "@/lib/api/client";
import { TERMS } from "../../_lib/glossary";
import { inOnPickupRun } from "./transportLegs";

// The gate stamps as steps in process order, per direction:
//   inbound (příjem):  Gate-in → Draft receipt → Receipt → Gate-out
//   outbound (výdej):  Pick-up truck in → WH release → Gate-out (stamped with the WH release)
//                      Loose import cargo (no container) is received first by its receipt (pieces,
//                      condition, location — or the typed "Received in warehouse" date): until
//                      then the truck stamp and the WH release wait for it (Q19, User Council 20 Nov).
//                      When a Trucking pick-up run brings the cargo in on the IN leg, its gate-in is
//                      the cargo arriving (plain Gate-in, not waiting for the receipt); the WH
//                      release still waits for the receipt.
//   domestic (příjem, Trucking's LTL through our hub): Gate-in (the receipt) → WH release (release
//                      gates clear, no open exception) → Gate-out (stamped with the WH release).
//                      No Draft receipt, no Receipt, no re-weigh.
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
  /** What a blocked step waits for that the screen can offer: the re-weigh, the house's tally / container, or the receipt. */
  needs?: "reweigh" | "tally" | "container" | "receipt";
};

type StepMovement = Pick<
  interfaces.GateMovementItem,
  "visit" | "status" | "armed" | "releaseGates" | "gateIn" | "gateOut" | "impRelease" | "expDraft" | "expReceipt" | "events"
> &
  Partial<Pick<interfaces.GateMovementItem, "needsReweigh" | "reweigh" | "container" | "leftAt" | "handling" | "receivedAt" | "loadInDate" | "containerNumber" | "operationType" | "transportLegs" | "overridden">>;

/** An overridden position still blocked: only Customs holds it (the server's HELD_BY_CUSTOMS). */
export const HELD_BY_CUSTOMS_STEP = `${TERMS.releaseGates} ${TERMS.blocked.toLowerCase()} — waiting for: Customs (a supervisor override never clears it; released once customs clears it)`;

/** LCL cargo is re-weighed before its receipt (the server refuses the Receipt stamp without it). */
export const REWEIGH_FIRST = "Re-weigh the cargo first — LCL cargo is re-weighed before the receipt";

/** Needs a re-weigh it does not have yet. */
export const reweighMissing = (m: Partial<Pick<interfaces.GateMovementItem, "needsReweigh" | "reweigh">>) => !!m.needsReweigh && !m.reweigh;

/**
 * Why the WH release waits for the position's container (the same rule as the server), or null:
 * cargo stuffed in an export container leaves with that container's gate-out, and an import house
 * is received by its tick-off at the stripping tally first.
 */
export function containerHoldsRelease(m: Pick<interfaces.GateMovementItem, "visit"> & Partial<Pick<interfaces.GateMovementItem, "container" | "leftAt">>): { reason: string; needs: "tally" | "container" } | null {
  const c = m.container;
  if (m.leftAt) return { reason: `Left the warehouse in container ${c?.number ?? ""}`.trim(), needs: "container" };
  if (!c) return null;
  if (c.kind === "export" && c.stuffedAt) return { reason: `Stuffed in container ${c.number} — it leaves with the container's gate-out, not through ${TERMS.whRelease}`, needs: "container" };
  if (m.visit === "výdej" && c.kind === "import" && c.tallyRequired && c.tallyOutcome !== "received") {
    return { reason: `Not received yet — tick this house off at the stripping tally of container ${c.number} first`, needs: "tally" };
  }
  return null;
}

/** Loose import cargo waits for its receipt before the pick-up truck and the WH release. */
export const RECEIPT_FIRST = "Not received yet — record the receipt first (pieces, condition, location), or the Received in warehouse date";

/**
 * Truly loose import cargo: outbound, no container house, no container number and not an FCL /
 * container-yard operation (Import FCL cargo comes in its container, so it has no receipt of its
 * own). The same rule as the server's isLooseImport (positionReceipt.ts).
 */
export const isLooseImport = (m: Pick<interfaces.GateMovementItem, "visit"> & Partial<Pick<interfaces.GateMovementItem, "container" | "containerNumber" | "operationType">>) =>
  m.visit === "výdej" && !m.container && !(m.containerNumber ?? "").trim() && !/^(FCL|Container yard)/.test(m.operationType ?? "");

/**
 * Loose import cargo (isLooseImport) that is not received yet: it arrived by truck, so no
 * stripping tally receives it — its receipt does (or the typed "Received in warehouse" date, at the
 * desk). The same rule as the server's receipt (positionReceipt.ts) and the lifecycle.
 */
export const receiptMissing = (
  m: Pick<interfaces.GateMovementItem, "visit" | "impRelease"> & Partial<Pick<interfaces.GateMovementItem, "container" | "receivedAt" | "loadInDate" | "containerNumber" | "operationType">>,
) => isLooseImport(m) && !m.impRelease && !m.receivedAt && !/^\d{4}-\d{2}-\d{2}$/.test(m.loadInDate ?? "");

/**
 * The phone's receipt entry for loose cargo whose "Received in warehouse" date is typed already:
 * the count keeps a typed day that is today or earlier (the storage clock and the shipment keep
 * it — moving it later is storage given away, a manager's call); only a day still to come becomes
 * today. `today` is the business day (Prague). The server's positionReceipt.service is the same rule.
 */
export const typedDateReceiptHint = (loadInDate: string, today: string) =>
  `Received in warehouse ${loadInDate} — count it here; ${loadInDate <= today ? "the count keeps that date" : "the count sets today"}`;

const isEmptyReturn = (g: string) => /empty return/i.test(g);

// Release-gate line set by the PIN check at the gate, never by hand. Must match the API's
// PICKUP_PIN_GATE (apps/api/services/warehouseConcept/services/pickupPin.ts).
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

/**
 * Release gates that still hold the release (the empty return never does). Under a supervisor
 * override only Customs can (it never clears Customs, Q18 (b)): the lines it cleared are not named
 * (mock council S10-3).
 */
export const waitingGates = (m: Pick<interfaces.GateMovementItem, "releaseGates"> & { overridden?: boolean }) =>
  m.releaseGates.filter((x) => x.s !== "OK" && !isEmptyReturn(x.g) && (!m.overridden || /^customs$/i.test(x.g))).map((x) => x.g);

export const isOutbound = (m: Pick<interfaces.GateMovementItem, "visit">) => m.visit === "výdej";

/** Domestic cargo (Trucking's LTL through our hub): in at the gate-in (its receipt), out through the WH release. Must match the API's DOMESTIC. */
export const isDomestic = (m: { handling?: string }) => m.handling === "Domestic";

/** The cargo leaves through the WH release, which stamps the gate-out too: outbound and Domestic cargo. */
export const leavesByRelease = (m: Pick<interfaces.GateMovementItem, "visit"> & { handling?: string }) => isOutbound(m) || isDomestic(m);

/**
 * The leg the cargo moves on at the gate now (as the server's grid follows it): outbound cargo the
 * OUT leg; Domestic cargo the IN leg (its pick-up run) until the gate-in, then the OUT leg (the line
 * haul it leaves on); other inbound cargo the IN leg.
 */
export const cargoLeg = (m: Pick<interfaces.GateMovementItem, "visit" | "gateIn"> & { handling?: string }): "IN" | "OUT" =>
  isOutbound(m) || (isDomestic(m) && !!m.gateIn) ? "OUT" : "IN";

type Flow = "in" | "out" | "domestic";
const flowOf = (m: Pick<StepMovement, "visit" | "handling">): Flow => (isOutbound(m) ? "out" : isDomestic(m) ? "domestic" : "in");

const SEQUENCE: Record<Flow, { kind: StepKind; label: string }[]> = {
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
  domestic: [
    { kind: "gateIn", label: TERMS.gateIn },
    { kind: "impRelease", label: TERMS.whRelease },
    { kind: "gateOut", label: TERMS.gateOut },
  ],
};
const LEGACY: Record<Flow, { kind: StepKind; label: string }[]> = {
  in: [{ kind: "impRelease", label: TERMS.whRelease }],
  out: [
    { kind: "expDraft", label: TERMS.draftReceipt },
    { kind: "expReceipt", label: TERMS.receipt },
  ],
  domestic: [
    { kind: "expDraft", label: TERMS.draftReceipt },
    { kind: "expReceipt", label: TERMS.receipt },
  ],
};

export function gateSteps(m: StepMovement): GateStep[] {
  const dir = flowOf(m);
  const lastEvent = (kind: string) => [...m.events].reverse().find((e) => e.kind === kind);
  const refused = m.status === "Refused";
  let seenOpen = false;

  // Outbound cargo a Trucking pick-up run brings in on the IN leg: its gate-in is the cargo arriving,
  // not the truck that collects it (the server's gateInLabel).
  const arrivesOnRun = dir === "out" && inOnPickupRun(m);
  const steps = SEQUENCE[dir].map(({ kind, label: plain }, i): GateStep => {
    const label = arrivesOnRun && kind === "gateIn" ? TERMS.gateIn : plain;
    const at = m[kind];
    if (at) {
      let evt = lastEvent(kind);
      let note: string | undefined;
      // Outbound / Domestic gate-out is stamped by the WH release; there is no gate-out event of its own.
      if (!evt && kind === "gateOut" && dir !== "in") {
        evt = lastEvent("impRelease");
        note = `Stamped with ${TERMS.whRelease}`;
      }
      return { kind, label, state: "done", at, by: evt?.by ?? "", reason: "", note };
    }
    if (refused) return { kind, label, state: "blocked", at: null, by: "", reason: `Refused — see ${TERMS.releaseGates}` };
    if (seenOpen) {
      const prev = SEQUENCE[dir][i - 1]!;
      const prevLabel = arrivesOnRun && prev.kind === "gateIn" ? TERMS.gateIn : prev.label;
      return { kind, label, state: "later", at: null, by: "", reason: `Stamp ${prevLabel} first` };
    }
    seenOpen = true;
    // Loose import cargo: the pick-up truck and the WH release wait for the receipt (LCL cargo is
    // re-weighed before it, so that comes first). A pick-up run's gate-in is the cargo arriving: it
    // does not wait (the server's stampBlocked is the same rule).
    if (dir === "out" && ((kind === "gateIn" && !arrivesOnRun) || kind === "impRelease") && receiptMissing(m)) {
      return reweighMissing(m)
        ? { kind, label, state: "blocked", at: null, by: "", reason: REWEIGH_FIRST, needs: "reweigh" }
        : { kind, label, state: "blocked", at: null, by: "", reason: RECEIPT_FIRST, needs: "receipt" };
    }
    if (kind === "expReceipt" && reweighMissing(m)) {
      return { kind, label, state: "blocked", at: null, by: "", reason: REWEIGH_FIRST, needs: "reweigh" };
    }
    if (kind === "impRelease") {
      const held = containerHoldsRelease(m);
      if (held) return { kind, label, state: "blocked", at: null, by: "", reason: held.reason, needs: held.needs };
    }
    // An override cleared every other line, so only Customs can still hold it (it never clears
    // Customs, Q18 (b)): say that, not the lines the override passed (mock council S10-3) - when
    // its Customs line is what holds it (the gates as the server reads them: transit cargo with an
    // MRN shows Customs OK), not for anything else (review of S10-3).
    if (kind === "impRelease" && !m.armed && m.overridden && m.releaseGates.some((x) => /^customs$/i.test(x.g) && x.s !== "OK")) {
      return { kind, label, state: "blocked", at: null, by: "", reason: HELD_BY_CUSTOMS_STEP };
    }
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
      ? [{ kind, label, state: "done", at, by: lastEvent(kind)?.by ?? "", reason: "", note: dir === "domestic" ? "Not a Domestic step — kept from before" : "Stamp of the other direction, kept from before", legacy: true }]
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

type StampFields = Pick<interfaces.GateMovementItem, "visit" | "gateIn" | "impRelease"> & { handling?: string } & Partial<Pick<interfaces.GateMovementItem, "transportLegs" | "plate" | "driver">>;

/**
 * What the stamp writes to the linked shipment, for the confirmation text; null when nothing.
 * Only inbound arrival is a receipt; an outbound gate-in is the pickup truck.
 */
export function writesBack(m: StampFields, kind: StepKind): string | null {
  if (!isOutbound(m) && (kind === "gateIn" || ((kind === "expDraft" || kind === "expReceipt") && !m.gateIn))) return "received date";
  if (kind === "impRelease" || (kind === "gateOut" && isOutbound(m))) return "released date and plate";
  return null;
}

/**
 * The WH release needs no plate or driver (a plate typed later still reaches the shipment), but a
 * release with neither known is worth a second look: one warning line, or "" (W9, User Council).
 * The truck is the OUT leg's; outbound cargo falls back to the grid's plate / driver, which follow it.
 */
export function releaseTruckWarning(m: StampFields): string {
  const out = m.transportLegs?.find((l) => l.leg === "OUT");
  const fallback = !isDomestic(m);
  const plate = (out?.plate || (fallback ? m.plate : "") || "").trim();
  const driver = (out?.driver || (fallback ? m.driver : "") || "").trim();
  if (plate && driver) return "";
  const missing = !plate && !driver ? "no plate and no driver's name" : !plate ? "no plate" : "no driver's name";
  return `The outgoing truck has ${missing} yet — check the truck before you release.`;
}

/** The confirmation text of a stamp: stamps are final, and some set the linked shipment's dates. */
export function stampConfirmText(m: StampFields & { gateRef: string }, kind: StepKind, label: string): string {
  const back = writesBack(m, kind);
  const truck = kind === "impRelease" ? releaseTruckWarning(m) : "";
  return `Stamp the ${label} on ${m.gateRef}? The stamp cannot be taken back${back ? ` and sets the linked shipment's ${back} (if any)` : ""}.${truck ? ` ${truck}` : ""}`;
}

/**
 * Why a picked stamp is not asked for at all (an info message), or null to go on and confirm it:
 * an already stamped step is not an error (the stamp is final), and outbound cargo leaves
 * through the WH release, which stamps the gate-out too.
 */
export function stampPrecheck(m: StampFields, kind: StepKind, label: string, at: string | null, fmt: (iso: string) => string): string | null {
  if (at) return `${label} was already stamped ${fmt(at)}`;
  if (kind === "gateOut" && isOutbound(m) && !m.impRelease) return `Outbound cargo leaves through ${TERMS.whRelease} — it stamps the gate-out too.`;
  if (kind === "gateOut" && isDomestic(m) && !m.impRelease) return `Domestic cargo leaves through ${TERMS.whRelease} — it stamps the gate-out too.`;
  if ((kind === "expDraft" || kind === "expReceipt") && isDomestic(m)) return `Domestic cargo has no ${label} — its ${TERMS.gateIn} is the receipt.`;
  return null;
}

/**
 * Stamps a phone may record without a connection (floor mode) and send later: the gate-in, the
 * draft receipt, the receipt and the gate-out of inbound cargo. The WH release (and the outbound
 * gate-out it stamps) needs the server's answer — release gates and the PIN — so never waits.
 */
export const QUEUEABLE_STAMPS: readonly StepKind[] = ["gateIn", "expDraft", "expReceipt", "gateOut"];
export const isQueueableStamp = (m: Pick<interfaces.GateMovementItem, "visit"> & { handling?: string }, kind: StepKind) =>
  QUEUEABLE_STAMPS.includes(kind) && !(kind === "gateOut" && leavesByRelease(m));
