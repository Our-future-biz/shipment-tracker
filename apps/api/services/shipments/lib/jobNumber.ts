// Pure rules for the letters of a shipment's Internal Reference (owner decision, 3 Nov 2026).
// The number is the company's CZ sequence; letters after "CZ" say what the job is, by its Freight
// Mode and Load Type: CZAIR00000023, CZFCL…, CZLCL…, CZBB…, CZPROJECT…, CZRAIL…, CZROAD….
// A Project Shipment is CZPROJECT by any freight mode. While the letters can't be told yet (Sea
// Freight without a Load Type, no Freight Mode) the reference is plain CZ00000023. How a
// reference is read, sorted and searched is shared with the other services (lib/jobNumber).

import { jobNumberDigits, type JobNumberLetters } from "../../../lib/jobNumber";

/** The Invoicing Status of a job that is invoiced - by an invoice issued here, or marked so by hand. */
export const INVOICED_STATUS = "Invoiced";

const same = (a: string | null | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.toLowerCase();

/** The letters of a job with this Freight Mode and Load Type; "" while they can't be told. */
export function jobNumberLetters(freightMode: string | null | undefined, loadType: string | null | undefined): JobNumberLetters | "" {
  if (same(loadType, "Project Shipment")) return "PROJECT";
  if (same(freightMode, "Air Freight")) return "AIR";
  if (same(freightMode, "Sea Break Bulk")) return "BB";
  if (same(freightMode, "Rail Freight")) return "RAIL";
  if (same(freightMode, "Road Freight")) return "ROAD";
  if (same(freightMode, "Sea Freight")) {
    if (same(loadType, "Full Load")) return "FCL";
    if (same(loadType, "Consolidation")) return "LCL";
  }
  return "";
}

/**
 * The reference with the letters this Freight Mode and Load Type give it, the number kept:
 * CZ00000023 by Air → CZAIR00000023. Text that is no CZ reference stays as it is.
 */
export function jobNumberFor(jobNumber: string, freightMode: string | null | undefined, loadType: string | null | undefined): string {
  const digits = jobNumberDigits(jobNumber);
  return digits === null ? jobNumber : `CZ${jobNumberLetters(freightMode, loadType)}${digits}`;
}

/** What the shipment row itself says about whether its reference is final. */
export interface ReferenceState {
  jobNumberFinal: boolean;
  invoicingStatus: string;
}

/**
 * Whether the shipment row says its reference is final, so its letters no longer follow the
 * Freight Mode and Load Type: Invoicing took it for an invoice number (jobNumberFinal), or the job
 * is marked Invoiced (by hand too - a job invoiced outside the system). A job invoiced before the
 * flag existed is known to Invoicing alone (ShipmentService.hasHadInvoice).
 */
export function referenceIsFinal(row: ReferenceState): boolean {
  return row.jobNumberFinal || same(row.invoicingStatus, INVOICED_STATUS);
}
