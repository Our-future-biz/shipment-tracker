// A Bill of Lading's number as two of them are compared: "CHI/BRV/V01035" and "chibrvv01035" are
// the same B/L. Shared by the pre-alert reading (one shipment per House B/L, extraction) and the
// shipments it makes (each House B/L once, one master job per Master B/L), so both sides agree.

/** The B/L number with letters and digits only, upper case; "" when it has none. */
export function billOfLadingKey(ref: string | null | undefined): string {
  return (ref ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The same, as Postgres computes it from a column (keep the two in step). */
export const BILL_OF_LADING_KEY_PATTERN = "[^A-Z0-9]";
