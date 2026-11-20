import type { interfaces } from "@/lib/api/client";
import { isDangerousShipment } from "@/lib/cargo";
import { isDeliveryDated } from "@/lib/deliveryDated";
import { documentTypeLabel, requiredDocumentTypes } from "@/lib/documentTypes";
import { freightKindOf, getTasksForDirection } from "../[jobNumber]/_components/taskDefinitions";

// Setting Shipment Status "Billing" releases the job to Invoicing → To bill (owner's decisions, 2026-10-14 and
// 2026-11-17). The User Council found nothing told operations so, and that the release asked for nothing (O11): the
// owner's answer Q9 (b) is to warn - never to block - with a short list of what the job still lacks, from facts the
// app already has: the Costs tab's lines, the tax date, the B/L number of a sea job, the task list, the required
// documents. The grid's status cell and the shipment's page show it in one dialog (BillingReleaseDialog). Pure, so
// it is unit-tested.

/** The hint on the "Billing" option of a Shipment Status list. */
export const BILLING_HINT = "Releases the job to Invoicing → To bill";

/** Is this status "Billing" (stored with its direction, "Billing [EXP]")? */
export const isBillingStatus = (status: string | null | undefined): boolean => /^Billing \[(IMP|EXP|DOM)\]$/.test((status ?? "").trim());

/** Whether this edit releases a job that was not released: the warning is then shown before anything is saved. */
export function asksBillingRelease(fieldKey: string, value: string, statusBefore: string | null | undefined): boolean {
  return fieldKey === "status" && isBillingStatus(value) && !isBillingStatus(statusBefore);
}

type ReleaseShipment = Pick<
  interfaces.ShipmentItem,
  | "tradeDirection"
  | "department"
  | "freightMode"
  | "actualDeparture"
  | "actualArrival"
  | "actualDeliveryDate"
  | "houseBolNumber"
  | "masterBolNumber"
  | "documentTypes"
  | "dangerous"
  | "cargoDimensions"
>;
type Value = string | number | null | undefined;
type SellingLine = { qty: Value; amount: Value };
type BuyingLine = { estQty: Value; estAmount: Value; realAmount: Value; invoiceNumber: string | null | undefined };

/** What the warning is worked out from; a part left null could not be read, and nothing is said of it. */
export interface BillingReleaseFacts {
  shipment: ReleaseShipment;
  selling: readonly SellingLine[] | null;
  buying: readonly BuyingLine[] | null;
  /** The keys of the job's ticked tasks. */
  ticked: ReadonlySet<string> | null;
}

const blank = (v: Value): boolean => v === null || v === undefined || String(v).trim() === "";
const num = (v: Value): number => (blank(v) ? 0 : Number(v));
/** A line's value as the server counts it: quantity (blank = 1) times amount (lib/shipmentStatus centsOf). */
const valueOf = (qty: Value, amount: Value): number => (blank(qty) ? 1 : num(qty)) * num(amount);
const lines = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
// The "Billed" tick is the step being taken: it is not missing.
const BILLED_TASKS = new Set(["imp_billed", "exp_billed"]);

/** The tax date the invoice goes by (its DUZP): the delivery of a Domestic or Road Department job, an export's ATD, else the ATA. */
function taxDateGap(s: ReleaseShipment): string | null {
  if (isDeliveryDated(s)) return blank(s.actualDeliveryDate) ? "No delivery date (the invoice's tax date)" : null;
  if ((s.tradeDirection ?? "").trim().toLowerCase() === "export") return blank(s.actualDeparture) ? "No ATD (the invoice's tax date)" : null;
  return blank(s.actualArrival) ? "No ATA (the invoice's tax date)" : null;
}

/** What the job still lacks before billing, in the order a clerk would look; empty when nothing is. */
export function billingGaps({ shipment, selling, buying, ticked }: BillingReleaseFacts): string[] {
  const gaps: string[] = [];
  if (selling && !selling.some((l) => valueOf(l.qty, l.amount) !== 0)) gaps.push("No selling charge with a value on the Costs tab");
  if (buying) {
    // A buying line with neither its real cost nor the supplier's invoice number is still an estimate.
    const open = buying.filter((l) => blank(l.realAmount) && !(l.invoiceNumber ?? "").trim() && valueOf(l.estQty, l.estAmount) !== 0).length;
    if (!buying.length) gaps.push("No buying cost on the Costs tab");
    else if (open) gaps.push(`${lines(open, "buying line", "buying lines")} without a real cost or supplier invoice`);
  }
  const taxDate = taxDateGap(shipment);
  if (taxDate) gaps.push(taxDate);
  if (freightKindOf(shipment.tradeDirection, shipment.freightMode, shipment.department) === "sea" && blank(shipment.houseBolNumber) && blank(shipment.masterBolNumber)) {
    gaps.push("No B/L number");
  }
  if (ticked) {
    const tasks = getTasksForDirection(shipment.tradeDirection, shipment.freightMode, shipment.department).filter((t) => !BILLED_TASKS.has(t.key));
    const left = tasks.filter((t) => !ticked.has(t.key)).length;
    if (left) gaps.push(`${left} of ${lines(tasks.length, "task", "tasks")} not ticked`);
  }
  const have = new Set(shipment.documentTypes ?? []);
  const missing = requiredDocumentTypes(isDangerousShipment(shipment)).filter((t) => !have.has(t));
  if (missing.length) gaps.push(`Documents missing: ${missing.map(documentTypeLabel).join(", ")}`);
  return gaps;
}
