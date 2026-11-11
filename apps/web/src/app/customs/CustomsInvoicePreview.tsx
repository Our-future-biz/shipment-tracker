"use client";

import { Modal, Button } from "antd";
import { escapeHtml } from "@/lib/html";
import { useToast } from "@/lib/toast";
import { businessToday, formatDate } from "@/lib/date";
import { money } from "@/lib/money";
import { type ShipmentItem } from "@/hooks/useShipments";

import { type CustomsInvoiceLine, totalsByCurrency } from "./_lib/customsInvoice";
import { EMPTY, LABEL_TEXT } from "@/styles/ui";


// Who the invoice is for: the customer, or the principal party when there is none.
const billTo = (s: ShipmentItem) => s.customer || s.principalParty;

const route = (s: ShipmentItem) => `${s.pol || "—"} → ${s.pod || "—"}`;

// Client-facing PDF via the browser print dialog, the same way as the quotation. Returns why that did
// not happen, or null once it did.
function printCustomsInvoice(shipment: ShipmentItem, issuedNumber: string, lines: CustomsInvoiceLine[]): string | null {
  // The company's day (Prague), as the app writes dates: a UTC day would be yesterday's after midnight here.
  const issueDate = formatDate(businessToday());
  const totals = totalsByCurrency(lines);
  const rows = lines
    .map(
      (l) => `<tr>
        <td>${escapeHtml(l.category) || "—"}</td>
        <td>${escapeHtml(l.currency)}</td>
        <td style="text-align:right">${escapeHtml(money(l.value))}</td>
      </tr>`,
    )
    .join("");
  const totalRows = totals
    .map(
      ([cur, sum], i) => `<tr class="totals">
        <td colspan="2">${i === 0 ? "Total" : ""}</td>
        <td style="text-align:right">${escapeHtml(cur)} ${escapeHtml(money(sum))}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(issuedNumber || shipment.jobNumber)}</title>
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
    .grid div span { color: #64748b; display: inline-block; width: 140px; vertical-align: top; }
  </style></head><body>
    <div class="header">
      <div>
        <h1>Customs Invoice</h1>
        <div class="ref">${escapeHtml(issuedNumber) || "—"}</div>
      </div>
      <div class="right">
        <div>Issued ${escapeHtml(issueDate)}</div>
        <div class="meta">Job ${escapeHtml(shipment.jobNumber)}</div>
      </div>
    </div>

    <h2>Bill to</h2>
    <div class="grid">
      <div><span>Customer</span>${escapeHtml(billTo(shipment)) || "—"}</div>
      <div><span>Customer reference</span>${escapeHtml(shipment.customerReference) || "—"}</div>
    </div>

    <h2>Shipment</h2>
    <div class="grid">
      <div><span>Internal reference</span>${escapeHtml(shipment.jobNumber)}</div>
      <div><span>Direction</span>${escapeHtml(shipment.tradeDirection) || "—"}</div>
      <div><span>Port of Loading → Port of Discharge</span>${escapeHtml(route(shipment))}</div>
      <div><span>Customs procedure</span>${escapeHtml(shipment.customsProcedure) || "—"}</div>
      <div><span>MRN number</span>${escapeHtml(shipment.mrn) || "—"}</div>
      <div><span>Container number</span>${escapeHtml(shipment.containerNumber) || "—"}</div>
      <div><span>House BoL number</span>${escapeHtml(shipment.houseBolNumber) || "—"}</div>
    </div>

    <h2>Charges</h2>
    <table>
      <thead><tr><th>Category</th><th>Currency</th><th style="text-align:right">Value</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="3">—</td></tr>`}</tbody>
      <tfoot>${totalRows}</tfoot>
    </table>
  </body></html>`;

  const w = window.open("", "_blank");
  // A blocked pop-up must not look like a button that does nothing.
  if (!w) return "The browser blocked the print window. Allow pop-ups for this site and try again.";
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
  return null;
}

// What the customer will get, before it is printed: the same look as the Quotation preview in Sales.
interface FieldProps {
  label: string;
  value?: string;
}

function Field({ label, value }: FieldProps) {
  return (
    <div className="flex text-[13px]">
      <span className="w-36 shrink-0 text-slate-500">{label}</span>
      <span className={value ? "text-slate-700" : EMPTY}>{value || "—"}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className={`mt-6 mb-2 ${LABEL_TEXT}`}>{children}</h3>;
}

interface CustomsInvoicePreviewProps {
  open: boolean;
  shipment: ShipmentItem;
  issuedNumber: string;
  lines: CustomsInvoiceLine[];
  onClose: () => void;
}

export function CustomsInvoicePreview({ open, shipment, issuedNumber, lines, onClose }: CustomsInvoicePreviewProps) {
  const toast = useToast();
  const totals = totalsByCurrency(lines);
  const print = () => {
    const blocked = printCustomsInvoice(shipment, issuedNumber, lines);
    if (blocked) toast.error(blocked);
  };

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
        <Button key="print" type="primary" onClick={print}>
          Download / Print
        </Button>,
      ]}
    >
      <div className="bg-white">
        <div className="bg-slate-800 text-white rounded-t-lg px-6 py-4 flex items-start justify-between">
          <div>
            <div className="text-[16px] leading-6 font-semibold">Customs Invoice</div>
            <div className="tabular-nums text-xs text-slate-300">{issuedNumber || "—"}</div>
          </div>
          <div className="text-right">
            <div className="text-sm">Job</div>
            <div className="tabular-nums text-xs text-slate-300">{shipment.jobNumber}</div>
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
            <Field label="Port of Loading → Port of Discharge" value={route(shipment)} />
            <Field label="Customs procedure" value={shipment.customsProcedure} />
            <Field label="MRN number" value={shipment.mrn} />
            <Field label="Container number" value={shipment.containerNumber} />
            <Field label="House BoL number" value={shipment.houseBolNumber} />
          </div>

          <SectionTitle>Charges</SectionTitle>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className={`border border-slate-200 px-2.5 py-1.5 ${LABEL_TEXT}`}>Category</th>
                <th className={`border border-slate-200 px-2.5 py-1.5 ${LABEL_TEXT}`}>Currency</th>
                <th className={`border border-slate-200 px-2.5 py-1.5 text-right ${LABEL_TEXT}`}>Value</th>
              </tr>
            </thead>
            <tbody>
              {lines.length > 0 ? (
                lines.map((l, i) => (
                  <tr key={i}>
                    <td className="border border-slate-200 px-2.5 py-1.5">{l.category || "—"}</td>
                    <td className="border border-slate-200 px-2.5 py-1.5">{l.currency}</td>
                    <td className="border border-slate-200 px-2.5 py-1.5 text-right">{money(l.value)}</td>
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
                    {cur ? `${cur} ${money(sum)}` : "—"}
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
