import type { controllers, interfaces } from "@/lib/api/client";
import { formatDate } from "@/lib/date";
import { money, normaliseAmount, parseMoney } from "@/lib/money";
import type { PillTone } from "@/components/Pill";

// What the claim dialog sends, and what the Claims tab says of a claim. Pure, so it is unit-tested.

export type ClaimValues = controllers.ClaimUpdateRequest;
export type Claim = interfaces.ShipmentClaimView;

/** Where a claim on costs stands (Council Outlay 9, D15): open holds its invoice's payment on Accounts Payable. */
export const CLAIM_STATUSES: { value: interfaces.ClaimStatus; label: string; tone: PillTone }[] = [
  { value: "open", label: "Open", tone: "amber" },
  { value: "accepted", label: "Accepted", tone: "green" },
  { value: "rejected", label: "Rejected", tone: "red" },
  { value: "withdrawn", label: "Withdrawn", tone: "slate" },
];

/**
 * Where a claim on the shipment (the cargo) stands (Council Outlay 11, D20): raised, the carrier notified,
 * handed to the insurer, and closed as settled, rejected or withdrawn.
 */
export const CARGO_CLAIM_STATUSES: { value: interfaces.CargoClaimStatus; label: string; tone: PillTone }[] = [
  { value: "open", label: "Open", tone: "amber" },
  { value: "notified", label: "Carrier notified", tone: "indigo" },
  { value: "with_insurer", label: "With the insurer", tone: "indigo" },
  { value: "settled", label: "Settled", tone: "green" },
  { value: "rejected", label: "Rejected", tone: "red" },
  { value: "withdrawn", label: "Withdrawn", tone: "slate" },
];

/** The statuses of a claim of this kind. */
export const statusesOf = (kind: interfaces.ClaimKind) => (kind === "cargo" ? CARGO_CLAIM_STATUSES : CLAIM_STATUSES);

/** A claim's status by name; an unknown one as Open. Of a claim on costs unless the kind is given. */
export const claimStatusOf = (status: string, kind: interfaces.ClaimKind = "cost") => {
  const list = statusesOf(kind);
  return list.find((s) => s.value === status) ?? list[0]!;
};

const CARGO_CLOSED: readonly string[] = ["settled", "rejected", "withdrawn"];

/** Whether a claim with this status is open: a cargo claim until settled, rejected or withdrawn; a claim on costs while Open. */
export const isOpenStatus = (kind: interfaces.ClaimKind, status: string): boolean => (kind === "cargo" ? !CARGO_CLOSED.includes(status) : status === "open");

// The server's sentences, so the dialog says the same before it is asked (lib/cargoClaim).
export const CARRIER_DAY_NEEDED = "Say when the carrier was notified: fill in the notice date";
export const INSURER_DAY_NEEDED = "Say when the insurer was notified: fill in the day";
export const SETTLED_AMOUNT_NEEDED = "Say what was settled: the settled amount and its currency";

/**
 * Why a cargo claim can't be saved so, or null when it can: "Carrier notified" needs the day the carrier was
 * told, "With the insurer" the day the insurer was, "Settled" the amount settled and its currency.
 */
export function cargoClaimProblem(values: Pick<ClaimValues, "status" | "noticeDate" | "insurerNotifiedOn" | "settledAmount" | "settledCurrency">): string | null {
  const filled = (v: string | undefined) => (v ?? "").trim() !== "";
  if (values.status === "notified" && !filled(values.noticeDate)) return CARRIER_DAY_NEEDED;
  if (values.status === "with_insurer" && !filled(values.insurerNotifiedOn)) return INSURER_DAY_NEEDED;
  if (values.status === "settled" && (!filled(values.settledAmount) || !filled(values.settledCurrency))) return SETTLED_AMOUNT_NEEDED;
  return null;
}

/** The two amounts are the same figure ("1,200.5" and "1200.50"), or both empty. */
const sameAmount = (a: string, b: string) =>
  a.trim() === "" || b.trim() === "" ? a.trim() === b.trim() : parseMoney(a) !== null && parseMoney(a) === parseMoney(b);

const AMOUNT_FIELDS = new Set(["claimAmount", "settledAmount"]);

/**
 * The fields of a changed claim that differ from the claim as it was opened: only those are sent,
 * so two people changing different fields of one claim keep both. A new claim sends them all, but
 * no empty owner: a new cargo claim's owner is then whoever raises it.
 */
export function claimChanges(claim: Claim | undefined, values: ClaimValues): ClaimValues {
  if (!claim) {
    if ((values.ownerUserId ?? "x").trim() !== "") return values;
    return Object.fromEntries(Object.entries(values).filter(([k]) => k !== "ownerUserId"));
  }
  const was = claim as unknown as Record<string, string | null | undefined>;
  return Object.fromEntries(
    Object.entries(values).filter(([k, v]) => (AMOUNT_FIELDS.has(k) ? !sameAmount(v ?? "", was[k] ?? "") : v !== (was[k] ?? ""))),
  );
}

/**
 * Something is filled in: a new claim needs that, as an empty one would still mark the shipment as claimed.
 * Its status is not something filled in: a new claim is Open unless set otherwise.
 */
export const claimFilled = (values: ClaimValues): boolean =>
  Object.entries(values).some(([k, v]) => k !== "status" && typeof v === "string" && v.trim() !== "");

/**
 * The amounts and currencies as the server takes them: "1 200,50" as "1200.5", "eur" as "EUR". An amount
 * that is no number goes as typed, so the server's sentence says what is wrong with it.
 */
export function claimSendable(values: ClaimValues): ClaimValues {
  const out = { ...values };
  for (const k of ["claimAmount", "settledAmount"] as const) {
    const v = out[k];
    if (v !== undefined) out[k] = normaliseAmount(v) ?? v.trim();
  }
  for (const k of ["claimCurrency", "settledCurrency"] as const) {
    const v = out[k];
    if (v !== undefined) out[k] = v.trim().toUpperCase();
  }
  return out;
}

/** A figure with its currency as a row shows it ("1,200.50 EUR"); "" for none. */
export function figureText(amount: string | null | undefined, currency: string | null | undefined): string {
  if (amount == null || amount === "") return "";
  const n = Number(amount);
  return [Number.isFinite(n) ? money(n) : amount, currency].filter(Boolean).join(" ");
}

/**
 * The amount a claim is for, as a row shows it: the claimed figure with its currency, else the
 * disputed amount typed as text on a claim from before figures were kept.
 */
export function claimAmountText(claim: Pick<Claim, "claimAmount" | "claimCurrency" | "amount">): string {
  return figureText(claim.claimAmount, claim.claimCurrency) || claim.amount;
}

export interface DeadlineLine {
  /** "Notify the carrier by" / "Time bar for a suit". */
  label: string;
  /** DD.MM.YYYY */
  day: string;
  /** Passed and not done: the carrier not notified by then, or the claim still open at its time bar. */
  passed: boolean;
}

/**
 * A cargo claim's deadlines while the company's claim time limits are on (D21): the last day to notify the
 * carrier (until it is notified) and the day a suit is time-barred (while the claim is open). None when off.
 */
export function claimDeadlines(
  claim: Pick<Claim, "kind" | "isOpen" | "noticeDate" | "noticeDeadline" | "suitDeadline">,
  timeLimitsOn: boolean,
  today: string,
): DeadlineLine[] {
  if (!timeLimitsOn || claim.kind !== "cargo") return [];
  const lines: DeadlineLine[] = [];
  if (claim.noticeDeadline && !claim.noticeDate && claim.isOpen) {
    lines.push({ label: "Notify the carrier by", day: formatDate(claim.noticeDeadline), passed: claim.noticeDeadline < today });
  }
  if (claim.suitDeadline && claim.isOpen) {
    lines.push({ label: "Time bar for a suit", day: formatDate(claim.suitDeadline), passed: claim.suitDeadline < today });
  }
  return lines;
}

/** What the deadlines count from, in words; "" when they are not counted. */
export const deadlineFromText = (from: Claim["deadlineFrom"]): string =>
  from === "delivery" ? "from delivery" : from === "arrival" ? "from arrival" : "";
