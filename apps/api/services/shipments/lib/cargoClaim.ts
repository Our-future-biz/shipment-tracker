import { isRealYmd } from "../../../lib/businessDate";
import type { AnyClaimStatus, CargoClaimStatus, ClaimKind } from "../interfaces/interfaces";
import { CLAIM_STATUSES, amountProblem, currencyProblem } from "./costClaim";

// A claim on the shipment itself - how the cargo arrived - has a life of its own (Council Outlay
// 11, D20): raised (open), the carrier notified, handed to the insurer, and closed as settled,
// rejected or withdrawn; an owner, the amount claimed and the amount settled, and the days the
// carrier and the insurer were told. The day the carrier was told is the claim's notice date (the
// column a claim on costs keeps the supplier's notice in), and the amount claimed its claim_amount
// / claim_currency. A claim on costs keeps its own statuses (lib/costClaim). Pure; tested in
// tests/cargoClaim.test.ts.

export const CARGO_CLAIM_STATUSES: readonly CargoClaimStatus[] = ["open", "notified", "with_insurer", "settled", "rejected", "withdrawn"];
const CARGO_CLOSED: readonly AnyClaimStatus[] = ["settled", "rejected", "withdrawn"];

/** Every status a claim of either kind may have (the column's check allows each kind its own). */
export const ANY_CLAIM_STATUSES: readonly AnyClaimStatus[] = [...new Set<AnyClaimStatus>([...CLAIM_STATUSES, ...CARGO_CLAIM_STATUSES])];

/** The statuses a claim of this kind may have. */
export const statusesOf = (kind: ClaimKind): readonly AnyClaimStatus[] => (kind === "cargo" ? CARGO_CLAIM_STATUSES : CLAIM_STATUSES);

/** Whether a claim is still open: a cargo claim until settled, rejected or withdrawn; a claim on costs until accepted, rejected or withdrawn. */
export const isOpenClaim = (kind: ClaimKind, status: AnyClaimStatus): boolean => (kind === "cargo" ? !CARGO_CLOSED.includes(status) : status === "open");

/** A status as the job's history writes it. */
export const CLAIM_STATUS_WORDS: Record<AnyClaimStatus, string> = {
  open: "Open",
  notified: "Carrier notified",
  with_insurer: "With the insurer",
  settled: "Settled",
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

/** Why this status can't be given to a claim of this kind, or null when it can. */
export function statusProblem(kind: ClaimKind, status: string): string | null {
  if ((statusesOf(kind) as readonly string[]).includes(status)) return null;
  return kind === "cargo"
    ? `The status of a claim on the shipment must be one of: ${CARGO_CLAIM_STATUSES.join(", ")}`
    : `The claim status must be one of: ${CLAIM_STATUSES.join(", ")}`;
}

/** The fields only a cargo claim has, as they are sent ("" clears one). The owner is the service's: it needs the company's users. */
export interface CargoClaimInput {
  insurerNotifiedOn?: string;
  settledAmount?: string;
  settledCurrency?: string;
}

export interface CargoClaimColumns {
  insurerNotifiedOn?: string | null;
  settledAmount?: string | null;
  settledCurrency?: string;
}

/** Whether any of a cargo claim's own fields is sent with something in it (an empty one only clears). */
export const fillsCargoFields = (input: CargoClaimInput & { ownerUserId?: string }): boolean =>
  [input.insurerNotifiedOn, input.settledAmount, input.settledCurrency, input.ownerUserId].some((v) => (v ?? "").trim() !== "");

/** A cargo claim's own fields as they go into the columns, or the sentence saying what is wrong with one. */
export function cargoClaimColumns(input: CargoClaimInput): { columns: CargoClaimColumns } | { problem: string } {
  const columns: CargoClaimColumns = {};
  if (input.insurerNotifiedOn !== undefined) {
    const day = input.insurerNotifiedOn.trim();
    if (day && !isRealYmd(day)) return { problem: "The day the insurer was notified must be a day as YYYY-MM-DD" };
    columns.insurerNotifiedOn = day || null;
  }
  if (input.settledAmount !== undefined) {
    const amount = input.settledAmount.trim();
    const problem = amountProblem(amount, "settled amount");
    if (problem) return { problem };
    columns.settledAmount = amount || null;
  }
  if (input.settledCurrency !== undefined) {
    const currency = input.settledCurrency.trim().toUpperCase();
    const problem = currencyProblem(currency);
    if (problem) return { problem };
    columns.settledCurrency = currency;
  }
  return { columns };
}

/** A cargo claim as it stands after a write: what its status asks for is checked on it. */
export interface CargoClaimState {
  status: AnyClaimStatus;
  /** The day the carrier was notified. */
  noticeDate: string | null;
  insurerNotifiedOn: string | null;
  settledAmount: string | null;
  settledCurrency: string;
}

export const CARRIER_DAY_NEEDED = "Say when the carrier was notified: fill in the notice date";
export const INSURER_DAY_NEEDED = "Say when the insurer was notified: fill in the day";
export const SETTLED_AMOUNT_NEEDED = "Say what was settled: the settled amount and its currency";

/**
 * Why a cargo claim can't stand so, or null when it can: "notified" needs the day the carrier was
 * told, "with the insurer" the day the insurer was, "settled" the amount settled and its currency.
 */
export function cargoStateProblem(claim: CargoClaimState): string | null {
  if (claim.status === "notified" && !claim.noticeDate) return CARRIER_DAY_NEEDED;
  if (claim.status === "with_insurer" && !claim.insurerNotifiedOn) return INSURER_DAY_NEEDED;
  if (claim.status === "settled" && (!claim.settledAmount || !claim.settledCurrency)) return SETTLED_AMOUNT_NEEDED;
  return null;
}

/** What a claim is, in a few words, for the job's history: its kind and what tells it from the job's other claims. */
export function claimWords(claim: { kind: ClaimKind; cargoState: string; supplier: string; invoiceNumber: string }): string {
  if (claim.kind === "cargo") return claim.cargoState.trim() ? `Cargo claim (${claim.cargoState.trim()})` : "Cargo claim";
  const which = [claim.supplier.trim(), claim.invoiceNumber.trim()].filter(Boolean).join(", ");
  return which ? `Claim on costs (${which})` : "Claim on costs";
}

/** A claim as the job's history keeps it when it is added or deleted: what it is, its amount, its status, its note. */
export function claimSummary(claim: {
  kind: ClaimKind;
  cargoState: string;
  supplier: string;
  invoiceNumber: string;
  reason: string;
  note: string;
  amount: string;
  claimAmount: string | null;
  claimCurrency: string;
  status: AnyClaimStatus;
}): string {
  const amount = claim.claimAmount ? [claim.claimAmount, claim.claimCurrency].filter(Boolean).join(" ") : claim.amount.trim();
  const said = (claim.kind === "cargo" ? claim.note : claim.reason).trim();
  return [claimWords(claim), amount, CLAIM_STATUS_WORDS[claim.status] ?? claim.status, said.length > 200 ? `${said.slice(0, 200)}…` : said].filter(Boolean).join(" · ");
}

/** The fields the job's history keeps a claim's life under (shipment_audit.field). The job's own Claim field (Yes / No) is "claim". */
export const CLAIM_HISTORY = {
  created: "claimCreated",
  status: "claimStatus",
  owner: "claimOwner",
  deleted: "claimDeleted",
  flag: "claim",
} as const;
