/** How a master job's invoice is split over its ticked shipments. */
export type SplitMethod = "wm" | "shipment";

export const SPLIT_METHOD_OPTIONS: { value: SplitMethod; label: string }[] = [
  { value: "wm", label: "By W/M (freight tons)" },
  { value: "shipment", label: "Per shipment (equal parts)" },
];

/** One shipment of the master job, as the split needs it. */
export interface MasterInvoiceRow {
  shipmentId: string;
  jobNumber: string;
  freightTon: number;
}

/**
 * The lines to split the invoice over: only the ticked shipments, each weighted by its
 * freight tons (W/M) or, per shipment, all the same.
 */
export function splitLines(rows: MasterInvoiceRow[], ticked: ReadonlySet<string>, method: SplitMethod) {
  return rows
    .filter((r) => ticked.has(r.shipmentId))
    .map((r) => ({ shipmentId: r.shipmentId, weight: method === "wm" ? r.freightTon : 1 }));
}

/** Ticked shipments that a W/M split can't give a part: no weight or volume. Per shipment needs none. */
export function missingWm(rows: MasterInvoiceRow[], ticked: ReadonlySet<string>, method: SplitMethod): MasterInvoiceRow[] {
  return method === "wm" ? rows.filter((r) => ticked.has(r.shipmentId) && r.freightTon <= 0) : [];
}
