import type { CustomerRecord } from "../schemas/customer.schema";
import type { CustomerAddressRecord } from "../schemas/customerAddress.schema";

// The customer keeps its seat (the Registered address) in its own columns too: the list's City /
// Country filter and search, the Registry card and header, new invoices and transport orders read
// them. They follow the Registered address whenever it is added, edited, retyped or deleted.

export type SeatAddress = Pick<CustomerAddressRecord, "street" | "city" | "postalCode" | "country">;
export type SeatColumns = Pick<CustomerRecord, "registeredAddress" | "city"> & Partial<Pick<CustomerRecord, "country">>;

/** "Wittelsbacherplatz 2, 80333 München": the form a seat typed in by hand is stored in. */
export const seatText = (street: string, postalCode: string, city: string) =>
  [street, [postalCode, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/**
 * The customer's columns for its live Registered address. Without one the address and the city are
 * empty; the country stays, as it is the company's country (VAT, the ARES / manual split).
 */
export function seatColumns(seat: SeatAddress | null): SeatColumns {
  if (!seat) return { registeredAddress: "", city: "" };
  return {
    registeredAddress: seatText(seat.street, seat.postalCode, seat.city),
    city: seat.city,
    ...(seat.country ? { country: seat.country } : {}),
  };
}

/** One live customer as the seat backfill reads it, with its live Registered address if any. */
export interface SeatRow {
  id: string;
  companyName: string;
  registeredAddress: string;
  city: string;
  country: string;
  createdAt: Date;
  seat: (SeatAddress & { updatedAt: Date }) | null;
}

export interface SeatPlan {
  checked: number;
  changes: { customerId: string; values: SeatColumns }[];
  /** Customers with no Registered address: left as they are, to be given one in the Addresses tab. */
  unmatched: { field: string; value: string; count: number }[];
}

/**
 * What the backfill writes. A seat still as it was written together with the customer (the same
 * transaction, or migration 0013 - so its updated_at is the customer's created_at) already matches
 * the columns, in the registry's own wording; only one changed since is copied.
 */
export function planSeatNormalize(rows: SeatRow[]): SeatPlan {
  const plan: SeatPlan = { checked: rows.length, changes: [], unmatched: [] };
  for (const row of rows) {
    if (!row.seat) {
      plan.unmatched.push({ field: "registeredAddress", value: row.companyName, count: 1 });
      continue;
    }
    if (row.seat.updatedAt.getTime() === row.createdAt.getTime()) continue;
    const values = seatColumns(row.seat);
    const same = values.registeredAddress === row.registeredAddress && values.city === row.city && (values.country ?? row.country) === row.country;
    if (!same) plan.changes.push({ customerId: row.id, values });
  }
  return plan;
}
