import type { interfaces } from "@/lib/api/client";
import { hasLineValue } from "./lineCounts";
import { openInvoiceRowIds } from "./openInvoices";

/**
 * A row of the lines table: an invoice line (ticked), a selling row left off the invoice, or a row
 * just ticked whose line the preview does not have yet (ticked, no line).
 */
export interface LineTableRow {
  key: string;
  sellingId: string | null;
  ticked: boolean;
  line?: interfaces.InvoiceDocLineItem;
  row?: interfaces.SellingCostItem;
}

/**
 * The lines card's To invoice table: the next invoice's lines (ticked selling rows) and, greyed, the
 * selling rows left unticked, so a line can be put back; in the Costs Breakdown order. Built from the
 * selling rows, so each row shows once even while the preview is a step behind a tick (it is
 * refetched after the rows): a ticked row shows its preview line, an unticked one its own values.
 * Rows on an open invoice (billed already) and rows with no value (never invoiced) are left out.
 * Preview lines of no current row (e.g. just deleted) follow at the end.
 */
export function lineTableRows(
  sellingRows: readonly interfaces.SellingCostItem[],
  previewLines: readonly interfaces.InvoiceDocLineItem[],
  docs: readonly Pick<interfaces.InvoiceDocItem, "kind" | "status" | "lines">[],
): LineTableRow[] {
  const lineOf = new Map(previewLines.filter((l) => l.sourceSellingCostId).map((l) => [l.sourceSellingCostId!, l]));
  const billed = openInvoiceRowIds(docs);
  const rows: LineTableRow[] = [];
  for (const r of [...sellingRows].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const line = lineOf.get(r.id);
    lineOf.delete(r.id);
    if (r.invoice && line) rows.push({ key: r.id, sellingId: r.id, ticked: true, line });
    else if (!billed.has(r.id) && hasLineValue(r)) rows.push({ key: r.id, sellingId: r.id, ticked: r.invoice, row: r });
  }
  previewLines.forEach((l, i) => {
    if (!l.sourceSellingCostId || lineOf.has(l.sourceSellingCostId)) rows.push({ key: `line-${i}`, sellingId: null, ticked: true, line: l });
  });
  return rows;
}
