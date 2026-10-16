import { containerKind, LEGACY_LINK } from "./containerRules";
import { isIsoDate, pragueDate } from "./storage";

// When a position was RECEIVED and when it LEFT, from its stamps — the start and stop points the
// Reports KPIs (and the stock sync) read. Pure, no imports from the services (no import cycle).
//
//   received   inbound (příjem): the WH receipt stamp (expReceipt); Domestic cargo: its gate-in
//              (the gate-in is the receipt — no draft receipt / receipt).
//              outbound (výdej): ticked received at the stripping tally of its import container
//              (receivedAt); without a container tally, the typed "Received in warehouse" date
//              (loadInDate, a day only). The truck's gate-in of an outbound position is the
//              pick-up, never the receipt.
//   left       inbound: the gate-out of the export container it was stuffed in (leftAt), else the
//              WH release (impRelease). outbound: the WH release (impRelease).

export interface StampPoint {
  /** The stamp; null when only a day is known (typed received date). */
  at: Date | null;
  /** YYYY-MM-DD in Prague time. */
  day: string;
  /** WH receipt · Stripping tally · Received date (typed) · WH release · Container gate-out */
  source: string;
}

export interface ReceiptMovement {
  visit: string;
  handling?: string;
  gateIn?: Date | null;
  expReceipt: Date | null;
  receivedAt: Date | null;
  loadInDate: string;
}

export interface LeftMovement {
  visit: string;
  impRelease: Date | null;
  leftAt: Date | null;
}

/** The house link of an outbound position, when it has one (to know whether a tally is due). */
export interface ReceiptHouse {
  addedBy: string;
  containerDirection: string;
}

const point = (at: Date, source: string): StampPoint => ({ at, day: pragueDate(at), source });

/**
 * A container link that makes the tally the receipt (the typed date then does not count): an
 * import container that is not a legacy link — and, as in the stock sync and the lifecycle
 * (warehouseStockPlan.receiptAndLeft), any export container. tests/stampAgreement.test.ts checks
 * that both give the same receipt and leaving.
 */
const tallyDue = (h: ReceiptHouse | null | undefined) => !!h && (containerKind(h.containerDirection) === "export" || h.addedBy !== LEGACY_LINK);

export function receiptOf(m: ReceiptMovement, house?: ReceiptHouse | null): StampPoint | null {
  if (m.visit !== "výdej" && m.handling === "Domestic") {
    const at = m.gateIn ?? m.expReceipt;
    return at ? point(at, m.gateIn ? "Gate-in" : "WH receipt") : null;
  }
  if (m.visit !== "výdej") return m.expReceipt ? point(m.expReceipt, "WH receipt") : null;
  if (m.receivedAt) return point(m.receivedAt, "Stripping tally");
  if (!tallyDue(house) && isIsoDate(m.loadInDate)) return { at: null, day: m.loadInDate, source: "Received date (typed)" };
  return null;
}

export function leftOf(m: LeftMovement): StampPoint | null {
  if (m.visit !== "výdej" && m.leftAt) return point(m.leftAt, "Container gate-out");
  return m.impRelease ? point(m.impRelease, "WH release") : null;
}
