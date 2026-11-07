"use client";

import { Alert, Input, Select } from "antd";
import { chargeLabel, chargeOptions } from "@/lib/chargeCodes";
import type { interfaces } from "@/lib/api/client";
import { HINT, TD, TD_TOTAL, TH } from "@/styles/ui";
import { lineFlagged, lineTarget, linesTotals, matchNote, SPLIT_TARGET, type BlShipment, type InvoiceLineDraft, type LineMatch } from "../_lib/invoiceLines";

const money = (cents: number, currency: string) => `${(cents / 100).toFixed(2)} ${currency}`;

interface Props {
  lines: InvoiceLineDraft[];
  matches: LineMatch[];
  shipments: BlShipment[];
  currency: string;
  /** the invoice's total as read */
  total: number;
  onLine: (index: number, patch: Partial<InvoiceLineDraft>) => void;
}

// An invoice's lines, each with the shipment it goes to. A line whose B/L is a shipment's goes there;
// any other goes to the split, marked amber, and a person may send it to one shipment instead.
export function InvoiceLinesTable({ lines, matches, shipments, currency, total, onLine }: Props) {
  const targets = [
    { value: SPLIT_TARGET, label: "Split over the ticked shipments" },
    ...shipments.map((s) => ({ value: s.shipmentId, label: s.jobNumber })),
  ];
  const totals = linesTotals(lines, currency);
  const lineCents = totals.get(currency) ?? 0;
  const off = totals.size === 1 && total > 0 && lineCents !== Math.round(total * 100);
  const flagged = lines.filter((l, i) => lineFlagged(l, matches[i]!)).length;

  return (
    <div className="mb-4">
      {flagged > 0 && (
        <Alert
          className="mb-3"
          type="warning"
          showIcon
          message={`${flagged} line${flagged === 1 ? "" : "s"} couldn't be matched to a shipment by B/L`}
          description="They go to the split below. Choose a shipment for any you can place."
        />
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH}>B/L</th>
              <th className={TH}>On the invoice</th>
              <th className={TH}>Charge</th>
              <th className={`${TH} !text-right`}>Amount</th>
              <th className={TH}>Goes to</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const match = matches[i]!;
              const amber = lineFlagged(l, match);
              const note = l.target ? null : matchNote(match);
              return (
                <tr key={i} className={amber ? "bg-amber-50" : undefined}>
                  <td className={`${TD} tabular-nums whitespace-nowrap`}>{l.bl || "—"}</td>
                  <td className={TD}>{l.item || "—"}</td>
                  <td className={`${TD} min-w-[220px]`}>
                    <Select
                      size="small"
                      className="w-full"
                      showSearch
                      optionFilterProp="label"
                      placeholder="Choose a charge"
                      status={l.category ? undefined : "error"}
                      aria-label={`Charge of ${l.item || "this line"}`}
                      value={l.category || undefined}
                      options={chargeOptions().map((c) => ({ value: c.value, label: c.label }))}
                      onChange={(category: string) => onLine(i, { category })}
                    />
                  </td>
                  <td className={`${TD} w-[130px]`}>
                    <Input
                      size="small"
                      className="text-right tabular-nums"
                      aria-label={`Amount of ${l.item || "this line"}`}
                      value={l.amount}
                      suffix={<span className="text-[11px] text-slate-400">{l.currency || currency}</span>}
                      onChange={(e) => onLine(i, { amount: e.target.value.replace(",", ".") })}
                    />
                  </td>
                  <td className={`${TD} min-w-[220px]`}>
                    <Select
                      size="small"
                      className="w-full"
                      showSearch
                      optionFilterProp="label"
                      aria-label={`Where ${l.item || "this line"} goes`}
                      value={lineTarget(l, match)}
                      options={targets}
                      onChange={(target: string) => onLine(i, { target })}
                    />
                    {note && <div className={`mt-0.5 text-[11px] ${amber ? "text-amber-700" : "text-slate-500"}`}>{note}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className={TD_TOTAL} colSpan={3}>
                Lines total
              </td>
              <td className={`${TD_TOTAL} text-right tabular-nums whitespace-nowrap`} colSpan={1}>
                {[...totals].map(([c, cents]) => money(cents, c)).join(" + ")}
              </td>
              <td className={TD_TOTAL} />
            </tr>
          </tfoot>
        </table>
      </div>
      {off && <Alert className="mt-2" type="warning" showIcon message={`The lines come to ${money(lineCents, currency)}, the invoice says ${money(Math.round(total * 100), currency)}. Check the amounts before posting.`} />}
    </div>
  );
}

/** What each shipment gets: the new buying rows, as the server works them out. */
export function InvoiceLinesPreview({ rows, jobOf }: { rows: interfaces.InvoiceLinesRow[]; jobOf: (shipmentId: string) => string }) {
  return (
    <div className="mb-4">
      <div className={`${HINT} mb-1.5`}>New buying rows, as they will be posted:</div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH}>Shipment</th>
              <th className={TH}>Charge</th>
              <th className={`${TH} !text-right`}>Real cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.shipmentId} ${r.category} ${r.currency}`} className={r.repeated ? "bg-amber-50" : undefined}>
                <td className={`${TD} tabular-nums`}>{jobOf(r.shipmentId)}</td>
                <td className={TD}>
                  {chargeLabel(r.category)}
                  {r.repeated && <span className="block text-[11px] text-amber-700">Already posted from this invoice number</span>}
                </td>
                <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>
                  {r.amount} {r.currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
