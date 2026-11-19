import { isUuid } from "../../../lib/uuid";
import type { AnyClaimStatus, ClaimStatus } from "../interfaces/interfaces";

// A claim on costs is tied to the supplier invoice it disputes, with the amount as a number, its
// currency and where it stands. Accounts Payable (the invoicing service) holds the invoice's payment
// while the claim is open, so these fields are checked here, before they reach the columns. Pure.

export const CLAIM_STATUSES: readonly ClaimStatus[] = ["open", "accepted", "rejected", "withdrawn"];

/** The fields of a claim on costs, as they are sent ("" clears one). */
export interface CostClaimInput {
  supplierInvoiceId?: string;
  claimAmount?: string;
  claimCurrency?: string;
  status?: string;
}

/** The same fields as stored; a field not sent stays undefined (left as it is). */
export interface CostClaimColumns {
  supplierInvoiceId?: string | null;
  claimAmount?: string | null;
  claimCurrency?: string;
  status?: ClaimStatus;
}

/** The statuses in which a claim of either kind is still open: a claim on costs "open"; a cargo claim also "notified" and "with_insurer" (lib/cargoClaim). */
const OPEN_STATUSES: readonly AnyClaimStatus[] = ["open", "notified", "with_insurer"];

/** Whether a claim in this status is closed: accepted, rejected or withdrawn (a cargo claim also settled). */
export const isClosedStatus = (status: AnyClaimStatus): boolean => !OPEN_STATUSES.includes(status);

/** Why an amount as typed (trimmed, "" for none) can't be kept in a numeric(14,2) column, or null when it can. */
export function amountProblem(amount: string, what = "claimed amount"): string | null {
  // At most 12 digits before the point and 2 after: what numeric(14,2) holds. A claim is never below zero.
  return amount && !/^\d{1,12}(\.\d{1,2})?$/.test(amount) ? `The ${what} must be a number with at most 2 decimal places, like 120.50` : null;
}

/** Why a currency (trimmed, upper case, "" for none) is no 3-letter code, or null when it is one. */
export const currencyProblem = (currency: string): string | null => (currency && !/^[A-Z]{3}$/.test(currency) ? "The currency must be a 3-letter code, like EUR" : null);

/**
 * The cost fields as they go into the columns, or the plain sentence saying what is wrong with one.
 * An empty id or amount is stored as null (a uuid and a numeric column take no empty text); the
 * currency is kept upper case.
 */
export function costClaimColumns(input: CostClaimInput): { columns: CostClaimColumns } | { problem: string } {
  const columns: CostClaimColumns = {};
  if (input.supplierInvoiceId !== undefined) {
    const id = input.supplierInvoiceId.trim();
    if (id && !isUuid(id)) return { problem: "The supplier invoice must be given by its id" };
    columns.supplierInvoiceId = id ? id.toLowerCase() : null;
  }
  if (input.claimAmount !== undefined) {
    const amount = input.claimAmount.trim();
    const problem = amountProblem(amount);
    if (problem) return { problem };
    columns.claimAmount = amount || null;
  }
  if (input.claimCurrency !== undefined) {
    const currency = input.claimCurrency.trim().toUpperCase();
    const problem = currencyProblem(currency);
    if (problem) return { problem };
    columns.claimCurrency = currency;
  }
  if (input.status !== undefined) {
    if (!(CLAIM_STATUSES as readonly string[]).includes(input.status)) {
      return { problem: `The claim status must be one of: ${CLAIM_STATUSES.join(", ")}` };
    }
    columns.status = input.status as ClaimStatus;
  }
  return { columns };
}

/** Whether any cost field is sent with something in it (an empty one only clears). */
export const fillsCostFields = (input: CostClaimInput): boolean =>
  [input.supplierInvoiceId, input.claimAmount, input.claimCurrency].some((v) => (v ?? "").trim() !== "") || input.status !== undefined;

/**
 * When and by whom the claim was closed, after a change of status to `next` from `previous`
 * (undefined for a new claim). Closing stamps now and who; reopening clears the stamps; a status
 * sent as it already is keeps them, so saving a closed claim again does not move its date.
 */
export function closingStamps(
  next: AnyClaimStatus,
  previous: AnyClaimStatus | undefined,
  by: string,
  now: Date,
): { closedAt: Date | null; closedBy: string } | null {
  if (next === previous) return null;
  return isClosedStatus(next) ? { closedAt: now, closedBy: by } : { closedAt: null, closedBy: "" };
}
