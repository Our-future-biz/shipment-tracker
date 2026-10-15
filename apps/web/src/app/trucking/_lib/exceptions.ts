import type { DeliveryException, ExceptionCause, ExceptionDecision, ExceptionKind, FailedReason } from "@/hooks/useTruckingControl";
import type { ActionState, StatusChip } from "./consignments";

// Delivery exceptions: what went wrong at delivery, who bears it and whether it is settled.
// Tested in exceptions.test.ts.

export const EXCEPTION_KIND_LABELS: Record<ExceptionKind, string> = {
  FAILED_DELIVERY: "Failed delivery",
  DAMAGE: "Damage",
  SHORTAGE: "Shortage",
  OVERAGE: "Overage",
  WAITING_TIME: "Waiting time",
  REDELIVERY: "Redelivery",
  OTHER: "Other",
};

export const FAILED_REASON_LABELS: Record<FailedReason, string> = {
  CLOSED: "Closed",
  ABSENT: "Nobody there",
  REFUSED: "Refused",
  WRONG_ADDRESS: "Wrong address",
  REFUSED_DAMAGED: "Refused — damaged",
  NO_AVIZACE: "No avizace",
  OTHER: "Other",
};

export const CAUSE_LABELS: Record<ExceptionCause, string> = {
  CUSTOMER: "Customer",
  HAULIER: "Haulier",
  US: "Us",
  UNKNOWN: "Unknown",
};

export const DECISION_LABELS: Record<ExceptionDecision, string> = {
  CHARGE_CUSTOMER: "Charge the customer",
  CLAIM_HAULIER: "Claim from the haulier",
  ABSORB: "We absorb it",
  PENDING: "Not decided",
};

/** Kinds that count pieces; waiting time counts minutes. */
export const PIECE_KINDS: readonly ExceptionKind[] = ["DAMAGE", "SHORTAGE", "OVERAGE"];

/** Open: not decided yet, or decided and not closed. An open exception keeps its consignment from Ready to bill. */
export const isExceptionOpen = (e: Pick<DeliveryException, "decision" | "closedAt">) => e.decision === "PENDING" || !e.closedAt;

export function exceptionChip(e: Pick<DeliveryException, "decision" | "closedAt">): StatusChip {
  if (e.closedAt) return { label: "Closed", tone: "g", hint: "Decided and closed" };
  if (e.decision === "PENDING") return { label: "Open", tone: "r", hint: "Waiting for a decision — keeps the consignment from Ready to bill" };
  return { label: "Decided", tone: "a", hint: "Decided; close it when it is settled — until then the consignment is not Ready to bill" };
}

const yes: ActionState = { allowed: true, reason: "" };
const no = (reason: string): ActionState => ({ allowed: false, reason });

/** The decisions a user may choose: a manager any; anyone else only to absorb it at no cost. */
export const decisionChoices = (manager: boolean): Exclude<ExceptionDecision, "PENDING">[] => (manager ? ["CHARGE_CUSTOMER", "CLAIM_HAULIER", "ABSORB"] : ["ABSORB"]);

/** Whether this decision may be saved by this user (the server holds the same rules). */
export function decisionState(decision: ExceptionDecision, amount: number | null, manager: boolean, reason: string): ActionState {
  if (decision === "PENDING") return no("Choose a decision");
  const cost = amount ?? 0;
  if (cost < 0) return no("The amount cannot be negative");
  if ((decision === "CHARGE_CUSTOMER" || decision === "CLAIM_HAULIER") && cost <= 0) return no("Enter the amount");
  if (!manager && (decision !== "ABSORB" || cost > 0)) return no("Only a manager can charge the customer, claim from the haulier or absorb a cost above 0");
  if (reason.trim().length < 3) return no("Give the reason");
  return yes;
}

/** Whether an exception can be decided now. */
export function decideState(e: Pick<DeliveryException, "closedAt">): ActionState {
  return e.closedAt ? no("Already closed") : yes;
}

/** Whether an exception can be closed now: decided and not closed yet. */
export function closeState(e: Pick<DeliveryException, "decision" | "closedAt">): ActionState {
  if (e.closedAt) return no("Already closed");
  if (e.decision === "PENDING") return no("Decide it first");
  return yes;
}

export interface ExceptionDraft {
  kind: ExceptionKind;
  failedReason: FailedReason | null;
  description: string;
  pieces: number | null;
  waitingMinutes: number | null;
}

/** Why a new exception cannot be saved, one line per problem. */
export function exceptionDraftProblems(d: ExceptionDraft): string[] {
  const out: string[] = [];
  if (d.kind === "FAILED_DELIVERY" && !d.failedReason) out.push("Say why the delivery failed");
  if (d.kind === "WAITING_TIME" && !(d.waitingMinutes && d.waitingMinutes > 0)) out.push("Enter the minutes waited");
  if (PIECE_KINDS.includes(d.kind) && !(d.pieces && d.pieces > 0)) out.push("Enter the pieces");
  if (d.description.trim().length < 3) out.push("Describe what happened");
  return out;
}

export const WAITING_BLOCK_MINUTES = 15;

/** Waiting time is charged per started 15 minutes beyond the free time: how many blocks. */
export function chargeableWaitingBlocks(waitingMinutes: number | null, freeMinutes: number): number {
  const over = (waitingMinutes ?? 0) - freeMinutes;
  return over > 0 ? Math.ceil(over / WAITING_BLOCK_MINUTES) : 0;
}

/** "45 min waited, 30 free → 1 × 15 min charged" for the create dialog. */
export function waitingText(waitingMinutes: number | null, freeMinutes: number): string {
  const blocks = chargeableWaitingBlocks(waitingMinutes, freeMinutes);
  if (!waitingMinutes) return `Free time ${freeMinutes} min`;
  if (!blocks) return `${waitingMinutes} min waited, within the ${freeMinutes} min free time — nothing to charge`;
  return `${waitingMinutes} min waited, ${freeMinutes} free → ${blocks} × ${WAITING_BLOCK_MINUTES} min chargeable`;
}
