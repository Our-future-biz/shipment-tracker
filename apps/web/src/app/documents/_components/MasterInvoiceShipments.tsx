"use client";

import { Alert, Checkbox, Radio } from "antd";
import type { interfaces } from "@/lib/api/client";
import {
  missingWm,
  SPLIT_METHOD_OPTIONS,
  type MasterInvoiceRow,
  type SplitMethod,
} from "../_lib/masterInvoice";

export interface MasterInvoiceShipment extends MasterInvoiceRow {
  /** Shipper, else consignee, so the user can tell the shipments apart. */
  party: string;
  /** Weight in tons and volume in cbm; W/M (freightTon) is the greater of the two. */
  tons: number;
  cbm: number;
}

interface MasterInvoiceShipmentsProps {
  rows: MasterInvoiceShipment[];
  ticked: ReadonlySet<string>;
  onTick: (shipmentId: string, ticked: boolean) => void;
  onTickAll: (ticked: boolean) => void;
  method: SplitMethod | null;
  onMethod: (method: SplitMethod) => void;
  /** After reading: each ticked shipment's part as the server splits it, and the cost it already has. */
  parts?: Record<string, string | null>;
  existing?: Record<string, interfaces.CostSplitExisting | null>;
  overwrite?: ReadonlySet<string>;
  onOverwrite?: (shipmentId: string, overwrite: boolean) => void;
  currency?: string;
}

// The shipments of the master job an invoice is read for: the user ticks the ones it covers and
// picks how it is split over them. Once read, each ticked shipment shows its part, and one that
// already has a real cost under the charge keeps it unless "Replace" is ticked.
export function MasterInvoiceShipments({
  rows,
  ticked,
  onTick,
  onTickAll,
  method,
  onMethod,
  parts,
  existing,
  overwrite,
  onOverwrite,
  currency,
}: MasterInvoiceShipmentsProps) {
  const tickedCount = rows.filter((r) => ticked.has(r.shipmentId)).length;
  const noWm = method ? missingWm(rows, ticked, method) : [];
  const showParts = !!parts;
  // Totals of the ticked shipments: what the invoice is split over.
  const tickedRows = rows.filter((r) => ticked.has(r.shipmentId));
  const sum = (pick: (r: MasterInvoiceShipment) => number) =>
    tickedRows.reduce((n, r) => n + pick(r), 0);
  const partsTotal = tickedRows.reduce((n, r) => n + (Number(parts?.[r.shipmentId] ?? 0) || 0), 0);

  return (
    <div>
      <div className="text-xs font-medium text-slate-500 mb-1.5">
        Split the invoice <span className="text-red-500">*</span>
      </div>
      <Radio.Group value={method} onChange={(e) => onMethod(e.target.value)} className="mb-3">
        {SPLIT_METHOD_OPTIONS.map((o) => (
          <Radio key={o.value} value={o.value}>
            {o.label}
          </Radio>
        ))}
      </Radio.Group>

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
          <Checkbox
            checked={rows.length > 0 && tickedCount === rows.length}
            indeterminate={tickedCount > 0 && tickedCount < rows.length}
            onChange={(e) => onTickAll(e.target.checked)}
            aria-label="Tick all shipments"
          />
          <span className="text-xs font-semibold text-slate-700">
            {tickedCount} of {rows.length} shipment{rows.length === 1 ? "" : "s"} ticked
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="m-0 px-3 py-4 text-xs text-slate-400">This master job has no shipments.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="w-8" />
                  <th className="text-left font-semibold p-2">Internal Reference</th>
                  <th className="text-left font-semibold p-2">Shipper / Consignee</th>
                  <th className="text-right font-semibold p-2">Weight (t)</th>
                  <th className="text-right font-semibold p-2">Volume (cbm)</th>
                  <th className="text-right font-semibold p-2">W/M</th>
                  {showParts && (
                    <th className="text-right font-semibold p-2">
                      Part{currency ? ` (${currency})` : ""}
                    </th>
                  )}
                  {showParts && <th className="text-left font-semibold p-2">Real cost now</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const on = ticked.has(r.shipmentId);
                  const had = existing?.[r.shipmentId];
                  const part = parts?.[r.shipmentId];
                  return (
                    <tr
                      key={r.shipmentId}
                      className={`border-b border-slate-100 last:border-b-0 ${on ? "" : "text-slate-400"}`}
                    >
                      <td className="pl-3">
                        <Checkbox
                          checked={on}
                          onChange={(e) => onTick(r.shipmentId, e.target.checked)}
                          aria-label={`Tick ${r.jobNumber}`}
                        />
                      </td>
                      <td className="p-2 font-mono">{r.jobNumber}</td>
                      <td className="p-2 max-w-[220px] truncate" title={r.party}>
                        {r.party || "—"}
                      </td>
                      <td className="p-2 text-right tabular-nums">{r.tons.toFixed(3)}</td>
                      <td className="p-2 text-right tabular-nums">{r.cbm.toFixed(3)}</td>
                      <td
                        className={`p-2 text-right tabular-nums font-semibold ${on && method === "wm" && r.freightTon <= 0 ? "text-red-500" : ""}`}
                      >
                        {r.freightTon.toFixed(3)}
                      </td>
                      {showParts && (
                        <td className="p-2 text-right tabular-nums font-semibold">
                          {on && part ? part : "—"}
                        </td>
                      )}
                      {showParts && (
                        <td className="p-2">
                          {on && had ? (
                            <span className="flex items-center gap-2">
                              <span className="text-amber-600">
                                {had.realAmount} {had.realCurrency}
                                {had.invoiceNumber ? ` · ${had.invoiceNumber}` : ""}
                              </span>
                              <Checkbox
                                checked={!!overwrite?.has(r.shipmentId)}
                                onChange={(e) => onOverwrite?.(r.shipmentId, e.target.checked)}
                              >
                                <span className="text-xs">Replace</span>
                              </Checkbox>
                            </span>
                          ) : (
                            on && <span className="text-slate-400">none</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td />
                  <td className="p-2" colSpan={2}>
                    Total of {tickedCount} ticked
                  </td>
                  <td className="p-2 text-right tabular-nums">{sum((r) => r.tons).toFixed(3)}</td>
                  <td className="p-2 text-right tabular-nums">{sum((r) => r.cbm).toFixed(3)}</td>
                  <td className="p-2 text-right tabular-nums">
                    {sum((r) => r.freightTon).toFixed(3)}
                  </td>
                  {showParts && (
                    <td className="p-2 text-right tabular-nums">
                      {partsTotal > 0 ? partsTotal.toFixed(2) : "—"}
                    </td>
                  )}
                  {showParts && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {noWm.length > 0 && (
        <Alert
          className="mt-3"
          type="warning"
          showIcon
          message={`No weight or volume on ${noWm.map((r) => r.jobNumber).join(", ")}: add it on the shipment, untick it, or split per shipment.`}
        />
      )}
      {showParts &&
        rows.some(
          (r) =>
            ticked.has(r.shipmentId) && existing?.[r.shipmentId] && !overwrite?.has(r.shipmentId),
        ) && (
          <p className="mt-2 mb-0 text-[11px] text-slate-400">
            A shipment that already has a real cost under this charge keeps it and is skipped,
            unless Replace is ticked.
          </p>
        )}
    </div>
  );
}
