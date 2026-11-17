import type { controllers, interfaces } from "@/lib/api/client";
import { money, normaliseAmount, parseMoney } from "@/lib/money";

// What the claim dialog sends. Pure, so it is unit-tested.

export type ClaimValues = controllers.ClaimUpdateRequest;

/** Where a claim on costs stands (Council Outlay 9, D15): open holds its invoice's payment on Accounts Payable. */
export const CLAIM_STATUSES: { value: interfaces.ClaimStatus; label: string; tone: "amber" | "green" | "red" | "slate" }[] = [
  { value: "open", label: "Open", tone: "amber" },
  { value: "accepted", label: "Accepted", tone: "green" },
  { value: "rejected", label: "Rejected", tone: "red" },
  { value: "withdrawn", label: "Withdrawn", tone: "slate" },
];

export const claimStatusOf = (status: string) => CLAIM_STATUSES.find((s) => s.value === status) ?? CLAIM_STATUSES[0]!;

/** The two amounts are the same figure ("1,200.5" and "1200.50"), or both empty. */
const sameAmount = (a: string, b: string) =>
  a.trim() === "" || b.trim() === "" ? a.trim() === b.trim() : parseMoney(a) !== null && parseMoney(a) === parseMoney(b);

/**
 * The fields of a changed claim that differ from the claim as it was opened: only those are sent,
 * so two people changing different fields of one claim keep both. A new claim sends them all.
 */
export function claimChanges(claim: interfaces.ClaimItem | undefined, values: ClaimValues): ClaimValues {
  if (!claim) return values;
  const was = claim as unknown as Record<string, string | null | undefined>;
  return Object.fromEntries(
    Object.entries(values).filter(([k, v]) => (k === "claimAmount" ? !sameAmount(v ?? "", was[k] ?? "") : v !== (was[k] ?? ""))),
  );
}

/**
 * Something is filled in: a new claim needs that, as an empty one would still mark the shipment as claimed.
 * Its status is not something filled in: a new claim on costs is Open unless set otherwise.
 */
export const claimFilled = (values: ClaimValues): boolean =>
  Object.entries(values).some(([k, v]) => k !== "status" && typeof v === "string" && v.trim() !== "");

/**
 * The claimed amount and currency as the server takes them: "1 200,50" as "1200.5", "eur" as "EUR". An amount
 * that is no number goes as typed, so the server's sentence says what is wrong with it.
 */
export function costClaimSendable(values: ClaimValues): ClaimValues {
  const out = { ...values };
  if (out.claimAmount !== undefined) out.claimAmount = normaliseAmount(out.claimAmount) ?? out.claimAmount.trim();
  if (out.claimCurrency !== undefined) out.claimCurrency = out.claimCurrency.trim().toUpperCase();
  return out;
}

/**
 * The amount a claim on costs is for, as a row shows it: the claimed figure with its currency, else the
 * disputed amount typed as text on a claim from before figures were kept.
 */
export function claimAmountText(claim: Pick<interfaces.ClaimItem, "claimAmount" | "claimCurrency" | "amount">): string {
  if (claim.claimAmount != null && claim.claimAmount !== "") {
    const n = Number(claim.claimAmount);
    return [Number.isFinite(n) ? money(n) : claim.claimAmount, claim.claimCurrency].filter(Boolean).join(" ");
  }
  return claim.amount;
}
