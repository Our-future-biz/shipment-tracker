import type { SalesQuoteData } from "./types";
import { computeTotals } from "./salesQuote";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));

// Client-facing PDF via the browser print dialog. Never shows buying/margin.
export function printQuote(quoteNumber: string, data: SalesQuoteData): void {
  const { selling } = computeTotals(data);
  const currency = data.currency ?? "EUR";

  const packageRows = (data.packages ?? [])
    .map(
      (p) => `<tr>
        <td>${esc(p.qty)}</td><td>${esc(p.type)}</td>
        <td>${esc(p.length)}×${esc(p.width)}×${esc(p.height)} cm</td>
        <td>${esc(p.weight)} kg</td>
      </tr>`,
    )
    .join("");

  const sellingRows = (data.sellingLines ?? [])
    .map(
      (l) => `<tr>
        <td>${esc(l.type)}</td><td>${esc(l.description)}</td>
        <td style="text-align:right">${esc(l.amount)} ${esc(l.currency || currency)}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(quoteNumber)}</title>
  <style>
    * { font-family: Arial, Helvetica, sans-serif; box-sizing: border-box; }
    body { margin: 0; padding: 32px; color: #1e293b; }
    .header { background: #1e293b; color: #fff; padding: 20px 24px; border-radius: 8px; display:flex; justify-content:space-between; }
    h1 { font-size: 20px; margin: 0; }
    .ref { font-family: monospace; font-size: 13px; opacity: .8; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin: 24px 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; }
    th { background: #f8fafc; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 13px; }
    .grid div span { color: #64748b; display: inline-block; width: 120px; }
    .total { text-align: right; font-size: 16px; font-weight: bold; margin-top: 8px; }
    .foot { margin-top: 28px; font-size: 12px; color: #64748b; }
  </style></head><body>
    <div class="header">
      <div><h1>Freight Quotation</h1><div class="ref">${esc(quoteNumber)}</div></div>
      <div style="text-align:right"><div>${esc(data.serviceType)}</div><div class="ref">${esc(data.incoterm)}</div></div>
    </div>

    <h2>Prepared for</h2>
    <div class="grid">
      <div><span>Customer</span>${esc(data.customerName)}</div>
      <div><span>Contact</span>${esc(data.customerContact)}</div>
      <div><span>Email</span>${esc(data.customerEmail)}</div>
      <div><span>Phone</span>${esc(data.customerPhone)}</div>
    </div>

    <h2>Routing</h2>
    <div class="grid">
      <div><span>Direction</span>${esc(data.direction)}</div>
      <div><span>Incoterm</span>${esc(data.incoterm)}</div>
      <div><span>Origin</span>${esc(data.origin)}</div>
      <div><span>Destination</span>${esc(data.destination)}</div>
      <div><span>Pickup</span>${esc(data.pickup)}</div>
      <div><span>Delivery</span>${esc(data.delivery)}</div>
      <div><span>Cargo ready</span>${esc(data.readyDate)}</div>
      <div><span>Transit</span>${esc(data.transit)}</div>
    </div>

    <h2>Cargo</h2>
    <table><thead><tr><th>Qty</th><th>Type</th><th>Dimensions</th><th>Weight</th></tr></thead>
    <tbody>${packageRows || `<tr><td colspan="4">${esc(data.commodity) || "—"}</td></tr>`}</tbody></table>

    <h2>Charges</h2>
    <table><thead><tr><th>Service</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${sellingRows || `<tr><td colspan="3">—</td></tr>`}</tbody></table>
    <div class="total">Total: ${selling.toLocaleString("en-US")} ${esc(currency)}</div>

    <h2>Shipping conditions</h2>
    <div class="grid" style="grid-template-columns:1fr">
      <div><span>Includes</span>${esc(data.shippingIncludes) || "—"}</div>
      <div><span>Excludes</span>${esc(data.shippingExcludes) || "—"}</div>
    </div>

    <div class="foot">
      Validity: ${esc(data.validityDays ?? 14)} days from issue. Rates subject to space and equipment availability.
      This quotation is indicative and does not constitute a binding contract.
    </div>
  </body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}
