/** What still names a customer in the other services, as they count it. */
export interface CustomerUses {
  /** Live shipments of the customer. */
  shipments: number;
  /** Sales quotes still in play: not won, lost, replaced or expired. */
  openQuotes: number;
  /** Issued invoices billed to it with something left to pay (Finance → Accounts Receivable). */
  unpaidInvoices: number;
}

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Why the customer can't be deleted yet - its live shipments and open quotes would name a deleted
 * company, and an unpaid invoice is still to be collected from it - with what to do instead; null
 * when nothing holds it.
 */
export function customerDeleteRefusal(companyName: string, uses: CustomerUses): string | null {
  const held: string[] = [];
  const todo: string[] = [];
  if (uses.shipments > 0) {
    held.push(counted(uses.shipments, "shipment", "shipments"));
    todo.push(`give ${uses.shipments === 1 ? "the shipment" : "the shipments"} another customer`);
  }
  if (uses.openQuotes > 0) {
    held.push(counted(uses.openQuotes, "open quote", "open quotes"));
    todo.push(`mark ${uses.openQuotes === 1 ? "the quote" : "the quotes"} Lost`);
  }
  const owes = uses.unpaidInvoices > 0 ? `still owes ${counted(uses.unpaidInvoices, "invoice", "invoices")}` : "";
  if (!held.length && !owes) return null;
  const why = [held.length ? `has ${held.join(" and ")}` : "", owes].filter(Boolean).join(" and ");
  const instead = todo.length ? `set it Inactive instead, or first ${todo.join(" and ")}` : "set it Inactive instead";
  return `${companyName} can't be deleted while it ${why}: ${instead}`;
}
