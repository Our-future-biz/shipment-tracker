"use client";

import { Modal, Button } from "antd";
import { type ShipmentItem } from "@/hooks/useShipments";

export interface CustomsInvoiceLine {
  category: string;
  currency: string;
  value: number;
}

const fmt = (n: number) => n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));

// The lines add up per currency, in the order the currencies first appear.
function totalsByCurrency(lines: CustomsInvoiceLine[]): [string, number][] {
  const sums = new Map<string, number>();
  for (const l of lines) sums.set(l.currency, (sums.get(l.currency) ?? 0) + l.value);
  return [...sums.entries()];
}

// Who the invoice is for: the customer, or the principal party when there is none.
const billTo = (s: ShipmentItem) => s.customer || s.principalParty;

const route = (s: ShipmentItem) => `${s.pol || "—"} → ${s.pod || "—"}`;

// Client-facing PDF via the browser print dialog, the same way as the quotation.
function printCustomsInvoice(shipment: ShipmentItem, issuedNumber: string, lines: CustomsInvoiceLine[]): void {
  const issueDate = new Date().toISOString().slice(0, 10);
  const totals = totalsByCurrency(lines);
  const rows = lines
    .map(
      (l) => `<tr>
        <td>${esc(l.category) || "—"}</td>
        <td>${esc(l.currency)}</td>
        <td style="text-align:right">${esc(fmt(l.value))}</td>
      </tr>`,
    )
    .join("");
  const totalRows = totals
    .map(
      ([cur, sum], i) => `<tr class="totals">
        <td colspan="2">${i === 0 ? "Total" : ""}</td>
        <td style="text-align:right">${esc(cur)} ${esc(fmt(sum))}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(issuedNumber || shipment.jobNumber)}</title>
  <style>
    * { font-family: Arial, Helvetica, sans-serif; box-sizing: border-box; }
    body { margin: 0; padding: 32px; color: #1e293b; }
    .header { background: #1e293b; color: #fff; padding: 20px 24px; border-radius: 8px; display: flex; justify-content: space-between; align-items: flex-start; }
    .header h1 { font-size: 20px; margin: 0 0 6px; }
    .header .ref { font-family: monospace; font-size: 13px; opacity: .85; }
    .header .right { text-align: right; font-size: 13px; }
    .header .right .meta { font-size: 12px; opacity: .85; margin-top: 4px; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin: 24px 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; }
    th { background: #f8fafc; }
    tr.totals td { background: #f1f5f9; font-weight: bold; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 13px; }
    .grid div span { color: #64748b; display: inline-block; width: 140px; }
  </style></head><body>
    <div class="header">
      <div>
        <h1>Customs Invoice</h1>
        <div class="ref">${esc(issuedNumber) || "—"}</div>
      </div>
      <div class="right">
        <div>Issued ${esc(issueDate)}</div>
        <div class="meta">Job ${esc(shipment.jobNumber)}</div>
      </div>
    </div>

    <h2>Bill to</h2>
    <div class="grid">
      <div><span>Customer</span>${esc(billTo(shipment)) || "—"}</div>
      <div><span>Customer reference</span>${esc(shipment.customerReference) || "—"}</div>
    </div>

    <h2>Shipment</h2>
    <div class="grid">
      <div><span>Internal reference</span>${esc(shipment.jobNumber)}</div>
      <div><span>Direction</span>${esc(shipment.tradeDirection) || "—"}</div>
      <div><span>POL → POD</span>${esc(route(shipment))}</div>
      <div><span>Customs procedure</span>${esc(shipment.customsProcedure) || "—"}</div>
      <div><span>MRN number</span>${esc(shipment.mrn) || "—"}</div>
      <div><span>Container number</span>${esc(shipment.containerNumber) || "—"}</div>
      <div><span>House BoL number</span>${esc(shipment.houseBolNumber) || "—"}</div>
    </div>

    <h2>Charges</h2>
    <table>
      <thead><tr><th>Category</th><th>Currency</th><th style="text-align:right">Value</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="3">—</td></tr>`}</tbody>
      <tfoot>${totalRows}</tfoot>
    </table>
  </body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

// What the customer will get, before it is printed: the same look as the Quotation preview in Sales.
export function CustomsInvoicePreview({
  open,
  shipment,
  issuedNumber,
  lines,
  onClose,
}: {
  open: boolean;
  shipment: ShipmentItem;
  issuedNumber: string;
  lines: CustomsInvoiceLine[];
  onClose: () => void;
}) {
  const totals = totalsByCurrency(lines);

  const Field = ({ label, value }: { label: string; value?: string }) => (
    <div className="flex text-[13px]">
      <span className="w-36 shrink-0 text-slate-400">{label}</span>
      <span className="text-slate-700">{value || "—"}</span>
    </div>
  );

  const SectionTitle = ({ children }: { children: string }) => (
    <h3 className="mt-6 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{children}</h3>
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={820}
      title="Invoice preview"
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="print" type="primary" onClick={() => printCustomsInvoice(shipment, issuedNumber, lines)}>
          Download / Print
        </Button>,
      ]}
    >
      <div className="bg-white">
        <div className="bg-slate-800 text-white rounded-t-lg px-6 py-4 flex items-start justify-between">
          <div>
            <div className="text-lg font-semibold">Customs Invoice</div>
            <div className="font-mono text-xs text-slate-300">{issuedNumber || "—"}</div>
          </div>
          <div className="text-right">
            <div className="text-sm">Job</div>
            <div className="font-mono text-xs text-slate-300">{shipment.jobNumber}</div>
          </div>
        </div>

        <div className="border border-t-0 border-slate-200 rounded-b-lg px-6 py-5">
          <SectionTitle>Bill to</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <Field label="Customer" value={billTo(shipment)} />
            <Field label="Customer reference" value={shipment.customerReference} />
          </div>

          <SectionTitle>Shipment</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <Field label="Internal reference" value={shipment.jobNumber} />
            <Field label="Direction" value={shipment.tradeDirection} />
            <Field label="POL → POD" value={route(shipment)} />
            <Field label="Customs procedure" value={shipment.customsProcedure} />
            <Field label="MRN number" value={shipment.mrn} />
            <Field label="Container number" value={shipment.containerNumber} />
            <Field label="House BoL number" value={shipment.houseBolNumber} />
          </div>

          <SectionTitle>Charges</SectionTitle>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-500">
                <th className="border border-slate-200 px-2.5 py-1.5 font-medium">Category</th>
                <th className="border border-slate-200 px-2.5 py-1.5 font-medium">Currency</th>
                <th className="border border-slate-200 px-2.5 py-1.5 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {lines.length > 0 ? (
                lines.map((l, i) => (
                  <tr key={i}>
                    <td className="border border-slate-200 px-2.5 py-1.5">{l.category || "—"}</td>
                    <td className="border border-slate-200 px-2.5 py-1.5">{l.currency}</td>
                    <td className="border border-slate-200 px-2.5 py-1.5 text-right">{fmt(l.value)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="border border-slate-200 px-2.5 py-1.5" colSpan={3}>
                    —
                  </td>
                </tr>
              )}
              {(totals.length > 0 ? totals : [["", 0] as [string, number]]).map(([cur, sum], i) => (
                <tr key={cur || i} className="font-semibold">
                  <td className="border border-slate-200 px-2.5 py-1.5" colSpan={2}>
                    {i === 0 ? "Total" : ""}
                  </td>
                  <td className="border border-slate-200 px-2.5 py-1.5 text-right">
                    {cur ? `${cur} ${fmt(sum)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
