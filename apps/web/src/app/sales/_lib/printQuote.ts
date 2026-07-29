import type { SalesQuoteData, PackageLine, CostLine } from "./types";
import { computeTotals, computeCargo, fmt } from "./salesQuote";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));

// Client-facing PDF via the browser print dialog. Never shows buying/cost/margin.
export function printQuote(quoteNumber: string, data: SalesQuoteData): void {
  const currency = data.currency ?? "EUR";
  const totals = computeTotals(data);
  const cargo = computeCargo(data);
  const issueDate = new Date().toISOString().slice(0, 10);
  const preparedBy = data.salesOwner || "Sales";
  const num = (v: unknown) => Number(v) || 0;

  // Cargo table rows: one per package line, with per-line total weight and CBM.
  const packages: PackageLine[] = data.packages ?? [];
  const cargoRows = packages
    .map((p: PackageLine) => {
      const totalWeight = num(p.qty) * num(p.weight);
      const cbm = (num(p.qty) * num(p.length) * num(p.width) * num(p.height)) / 1_000_000;
      return `<tr>
        <td>${esc(data.commodity) || "—"}</td>
        <td>${esc(p.type)}</td>
        <td style="text-align:right">${esc(p.qty)}</td>
        <td style="text-align:right">${esc(p.length)}×${esc(p.width)}×${esc(p.height)}</td>
        <td style="text-align:right">${esc(p.weight)}</td>
        <td style="text-align:right">${esc(Math.round(totalWeight * 100) / 100)}</td>
        <td style="text-align:right">${esc(cbm.toFixed(3))}</td>
      </tr>`;
    })
    .join("");

  const cargoBody =
    cargoRows ||
    `<tr>
      <td>${esc(data.commodity) || "—"}</td>
      <td>—</td>
      <td style="text-align:right">—</td>
      <td style="text-align:right">—</td>
      <td style="text-align:right">—</td>
      <td style="text-align:right">${esc(data.weight ?? "—")}</td>
      <td style="text-align:right">${esc(data.cbm ?? "—")}</td>
    </tr>`;

  const cargoFoot = `<tr class="totals">
    <td colspan="2">Totals</td>
    <td style="text-align:right">${esc(cargo.totalPackages)}</td>
    <td></td>
    <td></td>
    <td style="text-align:right">${esc(cargo.grossWeight)} kg</td>
    <td style="text-align:right">${esc(cargo.cbm)}</td>
  </tr>`;

  // Rate offer (selling) — never expose buying / cost / margin.
  const sellingLines: CostLine[] = data.sellingLines ?? [];
  const sellingRows = sellingLines
    .map(
      (l: CostLine) => `<tr>
        <td>${esc(l.type)}</td>
        <td>${esc(l.description)}</td>
        <td>${esc(l.currency || currency)}</td>
        <td style="text-align:right">${esc(num(l.amount).toLocaleString("en-US", { maximumFractionDigits: 2 }))}</td>
      </tr>`,
    )
    .join("");

  const rateOffer = sellingRows
    ? `<table>
        <thead><tr><th>Service</th><th>Description</th><th>Currency</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${sellingRows}</tbody>
        <tfoot><tr class="totals"><td colspan="3">Total</td><td style="text-align:right">${esc(fmt(totals.selling, currency))}</td></tr></tfoot>
      </table>`
    : `<div class="price-block">
        <span>Total price</span>
        <strong>${esc(fmt(totals.selling, currency))}</strong>
      </div>`;

  const additionalConditions = data.shippingTermsNotes
    ? `<div class="conditions-notes"><span>Additional conditions</span> ${esc(data.shippingTermsNotes)}</div>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(quoteNumber)}</title>
  <style>
    * { font-family: Arial, Helvetica, sans-serif; box-sizing: border-box; }
    body { margin: 0; padding: 32px; color: #1e293b; }
    .header { background: #1e293b; color: #fff; padding: 20px 24px; border-radius: 8px; display: flex; justify-content: space-between; align-items: flex-start; }
    .header h1 { font-size: 20px; margin: 0 0 6px; }
    .header .ref { font-family: monospace; font-size: 13px; opacity: .85; }
    .header .meta { font-size: 12px; opacity: .85; margin-top: 4px; }
    .header .right { text-align: right; }
    .header .right .svc { font-size: 14px; font-weight: bold; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin: 24px 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; }
    th { background: #f8fafc; }
    tr.totals td { background: #f1f5f9; font-weight: bold; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 13px; }
    .grid div span { color: #64748b; display: inline-block; width: 120px; }
    .route { font-size: 15px; font-weight: bold; margin: 4px 0 8px; }
    .route .arrow { color: #64748b; padding: 0 8px; }
    .chargeable { margin-top: 8px; font-size: 13px; color: #334155; }
    .chargeable strong { color: #1e293b; }
    .price-block { display: flex; justify-content: space-between; align-items: center; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; font-size: 15px; }
    .price-block strong { font-size: 18px; }
    .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .card { border-radius: 8px; padding: 14px 16px; font-size: 13px; }
    .card h3 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
    .card.includes { background: #f0fdf4; border: 1px solid #bbf7d0; }
    .card.includes h3 { color: #16a34a; }
    .card.excludes { background: #fef2f2; border: 1px solid #fecaca; }
    .card.excludes h3 { color: #dc2626; }
    .conditions-notes { margin-top: 12px; font-size: 13px; }
    .conditions-notes span { color: #64748b; }
    .foot { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
    .foot .sign { margin-top: 12px; font-size: 13px; color: #1e293b; font-weight: bold; }
  </style></head><body>
    <div class="header">
      <div>
        <h1>Freight Quotation</h1>
        <div class="ref">${esc(quoteNumber)}</div>
        <div class="meta">${esc(data.serviceType)} · ${esc(data.incoterm)}</div>
      </div>
      <div class="right">
        <div class="svc">Issued ${esc(issueDate)}</div>
        <div class="meta">Prepared by: ${esc(preparedBy)}</div>
      </div>
    </div>

    <h2>Prepared for</h2>
    <div class="grid">
      <div><span>Customer</span>${esc(data.customerName) || "—"}</div>
      <div><span>Contact</span>${esc(data.customerContact) || "—"}</div>
      <div><span>Email</span>${esc(data.customerEmail) || "—"}</div>
      <div><span>Phone</span>${esc(data.customerPhone) || "—"}</div>
    </div>

    <h2>Shipment routing</h2>
    <div class="route">${esc(data.origin) || "—"}<span class="arrow">→</span>${esc(data.destination) || "—"}</div>
    <div class="grid">
      <div><span>Direction</span>${esc(data.direction) || "—"}</div>
      <div><span>Incoterm</span>${esc(data.incoterm) || "—"}</div>
      <div><span>Cargo ready</span>${esc(data.readyDate) || "—"}</div>
      <div><span>Pickup</span>${esc(data.pickup) || "—"}</div>
      <div><span>Delivery</span>${esc(data.delivery) || "—"}</div>
    </div>

    <h2>Cargo</h2>
    <table>
      <thead><tr>
        <th>Commodity</th>
        <th>Packing</th>
        <th style="text-align:right">Qty</th>
        <th style="text-align:right">Dimensions (L×W×H cm)</th>
        <th style="text-align:right">Weight/pc (kg)</th>
        <th style="text-align:right">Total weight (kg)</th>
        <th style="text-align:right">CBM</th>
      </tr></thead>
      <tbody>${cargoBody}</tbody>
      <tfoot>${cargoFoot}</tfoot>
    </table>
    <div class="chargeable">Chargeable weight: <strong>${esc(cargo.chargeableWeight)} kg</strong></div>

    <h2>Rate offer</h2>
    ${rateOffer}

    <h2>Shipping conditions</h2>
    <div class="cards">
      <div class="card includes"><h3>Includes</h3>${esc(data.shippingIncludes) || "—"}</div>
      <div class="card excludes"><h3>Excludes</h3>${esc(data.shippingExcludes) || "—"}</div>
    </div>
    ${additionalConditions}

    <div class="foot">
      Validity: ${esc(data.validityDays ?? 14)} days from issue.
      This quotation is indicative and does not constitute a binding contract; rates are subject to space and equipment availability.
      <div class="sign">${esc(preparedBy)} · Sales</div>
    </div>
  </body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}
