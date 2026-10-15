import { qtyOrOne, round2 } from "./invoiceCalc";

/**
 * The "Ready to bill" queue: per shipment, which selling rows ticked for Invoice are not
 * on an open invoice yet. A row counts as invoiced while an issued (not credited) invoice
 * has a line made from it; after a credit note it is open to bill again.
 */

export interface QueueSellingRow {
  id: string;
  shipmentId: string;
  qty: string | null;
  amount: string | null;
  currency: string;
}

export interface QueueOpenInvoice {
  shipmentId: string;
  number: string;
  currency: string;
  gross: string;
  /** Selling rows the invoice lines were made from */
  sourceSellingCostIds: (string | null)[];
}

export type QueueStatus = "to_bill" | "partly_invoiced" | "invoiced";

export interface QueueEntry {
  shipmentId: string;
  status: QueueStatus;
  billingCurrency: string;
  /** Ticked rows not on an open invoice, converted at today's rates (an estimate until issued) */
  amountToBill: number;
  rowsToBill: number;
  /** Currencies of rows to bill that have no exchange rate (left out of amountToBill) */
  missingCurrencies: string[];
  invoiceNumbers: string[];
  /** Gross of the open invoices, per currency */
  invoiced: { currency: string; gross: number }[];
}

function rateOf(currency: string, rates: Record<string, number>): number | null {
  if (!currency || currency === "CZK") return 1;
  const r = rates[currency];
  return typeof r === "number" && r > 0 ? r : null;
}

export function buildBillingQueue(input: {
  rows: QueueSellingRow[];
  openInvoices: QueueOpenInvoice[];
  billingCurrencies: Map<string, string>;
  /** Today's ČNB rates, CZK per 1 unit */
  rates: Record<string, number>;
  /** Company ROE % today — applied to rows in another currency, as the invoice will */
  roePct: number;
}): QueueEntry[] {
  const { rates } = input;
  const roe = input.roePct / 100;
  const invoicedRowIds = new Set(input.openInvoices.flatMap((i) => i.sourceSellingCostIds).filter((x): x is string => !!x));

  const byShipment = new Map<string, QueueSellingRow[]>();
  for (const r of input.rows) byShipment.set(r.shipmentId, [...(byShipment.get(r.shipmentId) ?? []), r]);
  const invoicesByShipment = new Map<string, QueueOpenInvoice[]>();
  for (const i of input.openInvoices) invoicesByShipment.set(i.shipmentId, [...(invoicesByShipment.get(i.shipmentId) ?? []), i]);

  const shipmentIds = new Set([...byShipment.keys(), ...invoicesByShipment.keys()]);
  const entries: QueueEntry[] = [];
  for (const shipmentId of shipmentIds) {
    const rows = byShipment.get(shipmentId) ?? [];
    const invoices = invoicesByShipment.get(shipmentId) ?? [];
    const currency = input.billingCurrencies.get(shipmentId) || "CZK";
    const billingRate = rateOf(currency, rates);

    const missing = new Set<string>();
    let amount = 0;
    let rowsToBill = 0;
    for (const r of rows) {
      if (invoicedRowIds.has(r.id)) continue;
      const value = Number(r.amount ?? 0) * qtyOrOne(r.qty);
      if (!value) continue;
      rowsToBill += 1;
      const from = rateOf(r.currency, rates);
      if (from === null || billingRate === null) {
        missing.add(from === null ? r.currency : currency);
        continue;
      }
      amount += round2(((value * from) / billingRate) * ((r.currency || "CZK") === currency ? 1 : roe));
    }

    const invoiced = new Map<string, number>();
    for (const i of invoices) invoiced.set(i.currency, round2((invoiced.get(i.currency) ?? 0) + Number(i.gross)));

    if (rowsToBill === 0 && invoices.length === 0) continue; // nothing ticked, nothing invoiced
    entries.push({
      shipmentId,
      status: rowsToBill === 0 ? "invoiced" : invoices.length ? "partly_invoiced" : "to_bill",
      billingCurrency: currency,
      amountToBill: round2(amount),
      rowsToBill,
      missingCurrencies: [...missing].sort(),
      invoiceNumbers: invoices.map((i) => i.number).sort(),
      invoiced: [...invoiced.entries()].map(([c, gross]) => ({ currency: c, gross })),
    });
  }
  return entries;
}
