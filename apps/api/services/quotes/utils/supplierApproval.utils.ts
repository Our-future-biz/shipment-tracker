import { isUuid } from "../../../lib/uuid";
import { isPlainObject } from "./quoteDocument.utils";

// A new supplier a user who is no manager adds from a quote's Pricing waits for a manager's approval
// (customers service, Sales → Managers → Company approval). A quote with a buying line linked to one
// that waits, or that a manager declined, is not sent: the transition asks the customers service where
// the linked suppliers stand, and refuses in these words.

/** Where a linked supplier stands, as the customers service answers. */
export interface LinkedSupplierState {
  companyName: string;
  status: "" | "pending" | "declined" | "missing";
  comment: string;
}

const buyingLines = (data: unknown): Record<string, unknown>[] => {
  const lines = isPlainObject(data) ? data.buyingLines : undefined;
  return Array.isArray(lines) ? lines.filter(isPlainObject) : [];
};

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The Customer Database companies the quote's buying lines are linked to, each once. */
export function linkedSupplierIds(data: unknown): string[] {
  const ids = buyingLines(data)
    .map((l) => text(l.supplierCustomerId).toLowerCase())
    .filter(isUuid);
  return [...new Set(ids)];
}

/**
 * Why the quote can't go out for its suppliers: one waits for a manager's approval, or a manager
 * declined it. Null when none does. `unknown` is true when a line is linked to a supplier not among
 * `states` (the quote changed since they were read): the caller tries again.
 */
export function supplierGate(data: unknown, states: ReadonlyMap<string, LinkedSupplierState>): { message: string | null; unknown: boolean } {
  for (const line of buyingLines(data)) {
    const id = text(line.supplierCustomerId).toLowerCase();
    if (!isUuid(id)) continue;
    const state = states.get(id);
    if (!state) return { message: null, unknown: true };
    const name = state.companyName || text(line.supplier) || "The supplier";
    if (state.status === "pending") {
      return { message: `The new supplier ${name} waits for a manager's approval (Sales → Managers → Company approval) — the quote can be sent once it is approved`, unknown: false };
    }
    if (state.status === "declined") {
      return { message: `A manager declined the supplier ${name}${state.comment ? ` (${state.comment})` : ""} — pick another supplier on its buying line`, unknown: false };
    }
  }
  return { message: null, unknown: false };
}
