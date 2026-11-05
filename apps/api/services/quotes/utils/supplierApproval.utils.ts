import { isUuid } from "../../../lib/uuid";
import { isPlainObject } from "./quoteDocument.utils";

// A quote's suppliers come from the Customer Database only, and a new supplier a user who is no manager
// adds from a quote's Pricing waits for a manager's approval (customers service, Sales → Managers →
// Company approval). A quote is not sent - nor made Ready to Send or Won without going out: the margin
// gate's moves - while a buying line is linked to a supplier that waits, or that a manager declined, or
// names a supplier only typed (a line left so by a reload while the Add supplier dialog was open, a
// duplicated line, a save from elsewhere). The transition asks the customers service where the linked
// suppliers stand, and refuses in these words; the quote page says the same beforehand
// (web sales/_lib/supplierApproval.ts).

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
 * The buying lines whose supplier is only typed: a name, and no Customer Database company behind it.
 * A line priced from a tariff is not one of them: its supplier is the tariff's, and is not changed on
 * the line.
 */
export function typedSupplierLines(data: unknown): { charge: string; supplier: string }[] {
  return buyingLines(data)
    .filter((l) => text(l.supplier) && !isUuid(text(l.supplierCustomerId)) && !text(l.tariffRef))
    .map((l) => ({ charge: text(l.type) || text(l.description) || "a charge", supplier: text(l.supplier) }));
}

/** Why the quote can't go out for suppliers only typed, naming their lines; null when there is none. */
export function typedSupplierMessage(lines: readonly { charge: string; supplier: string }[]): string | null {
  if (!lines.length) return null;
  const named = lines.map((l) => `${l.charge} (${l.supplier})`).join(", ");
  return lines.length === 1
    ? `The supplier of the buying line ${named} is only typed — pick it from the Customer Database on Pricing (or add it there)`
    : `The suppliers of the buying lines ${named} are only typed — pick each from the Customer Database on Pricing (or add it there)`;
}

/**
 * Why the quote can't go out for its suppliers: one waits for a manager's approval, a manager declined
 * it, or a line's supplier is only typed. Null when none does. `unknown` is true when a line is linked
 * to a supplier not among `states` (the quote changed since they were read): the caller tries again.
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
  return { message: typedSupplierMessage(typedSupplierLines(data)), unknown: false };
}
