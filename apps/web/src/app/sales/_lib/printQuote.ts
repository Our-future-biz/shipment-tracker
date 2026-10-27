import type { CurrentExchangeRates } from "@/hooks/useExchangeRates";
import { fmtMoney } from "@/lib/money";
import type { SalesQuoteData, PackageLine, CostLine } from "./types";
import { UNSENT_QUOTE_STATUSES } from "./types";
import { hasCompanyDetails, type StoredCompanyDetails } from "./companyDetails";
import { escapeHtml } from "@/lib/html";
import { unpricedOverweight } from "./overweight";
import type { PickableUser } from "@/lib/people";
import { ownerNameForCustomer, ownerNameLoading } from "./ownerName";
import { businessDay, businessToday, cargoReadyDay, computeTotals, computeCargo, convertLine, documentBlock, fmtDimensions, fxClause, quoteValidUntil, ratesNeeded } from "./salesQuote";

// Whatever a user typed is text on the document, never markup.
const esc = escapeHtml;

// The stored company details belong on every quotation. While they are not known - which is not
// the same as none being stored - the document would go out without saying who it is from.
function senderBlock(company: StoredCompanyDetails): string | null {
  if (company.status === "loading") return "The company details are still loading. Try again in a moment.";
  if (company.status === "error") {
    return "The company details could not be loaded, so the quote would go out without them. Reload the page and try again.";
  }
  return null;
}

/** The quotation as an HTML document, or why the customer must not get one. */
type QuoteDocument = { html: string; blocked: null } | { html: null; blocked: string };

/** The company's users (useUsers), to name the sales owner for the customer, and whether they are still loading. */
export interface QuoteDocumentUsers {
  users: readonly PickableUser[];
  isLoading: boolean;
}

// The one definition of the client-facing quotation: the preview shows this HTML and Export PDF
// prints it, so what is checked on screen is what the customer receives. Never shows
// buying/cost/margin. A total that cannot be worked out must not reach the customer, so such a
// quote has no document. `exchange` is today's ČNB fixing and ROE % (useCurrentExchangeRates); a
// sent quote is priced at the rates stored on it. `people` are the company's users, to name the
// sales owner for the customer.
export function quoteDocument(
  quoteNumber: string,
  data: SalesQuoteData,
  exchange: Pick<CurrentExchangeRates, "rates" | "isError" | "isLoading" | "roePct" | "fixingDate">,
  company: StoredCompanyDetails,
  people: QuoteDocumentUsers,
): QuoteDocument {
  // A draft with lines in other currencies is priced at today's rates: not before they are in.
  if (!data.fx && exchange.isLoading && ratesNeeded(data).length) {
    return { html: null, blocked: "Today's ČNB rates are still loading. Try again in a moment." };
  }
  // The owner is recorded by e-mail and the customer reads a name: not before the users are in.
  if (ownerNameLoading(data.salesOwner, people.isLoading)) {
    return { html: null, blocked: "The company's users are still loading. Try again in a moment." };
  }
  const sheet = exchange.rates;
  const totals = computeTotals(data, sheet, exchange);
  const clause = fxClause(data, totals);
  const blocked = senderBlock(company) ?? documentBlock(totals, exchange.isError);
  if (blocked) return { html: null, blocked };

  const currency = totals.currency;
  const cargo = computeCargo(data);
  const from = company.details;
  const num = (v: unknown) => Number(v) || 0;
  // Every amount on the document shows its cents, so the lines and the total read as one column.
  const money = (amount: number | null) => esc(fmtMoney(amount, currency, true));
  // The day the quote was sent, so printing it again later does not date the offer anew; today for
  // a quote that is not sent as it stands - never sent, or revised or reopened since. The sent date
  // such a quote still carries belongs to the document the customer already holds: this one has
  // other prices, and marking it as sent will stamp a new date. The day on the company's (Prague)
  // calendar, as quoteValidUntil counts.
  const sent = !!data.sentAt && !UNSENT_QUOTE_STATUSES.includes(data.quoteStatus ?? "draft");
  const issueDate = sent && data.sentAt ? businessDay(new Date(data.sentAt)) : businessToday();
  // The one validity the app knows. A quote without a validity date promises none.
  const validUntil = quoteValidUntil(data);
  // The readiness the quote's screens show: a stored day. A text an earlier inquiry import left
  // in its place ("15 March") is on no screen, so it must not reach the customer from here.
  const cargoReady = cargoReadyDay(data);

  const sender = hasCompanyDetails(from)
    ? `<h2>From</h2>
    <div class="from">
      <div class="name">${esc(from.name)}</div>
      <div class="text">${esc(from.address)}</div>
      <div>${esc([from.companyId && `Company ID: ${from.companyId}`, from.vatId && `VAT ID: ${from.vatId}`].filter(Boolean).join(" · "))}</div>
      <div>${esc([from.phone, from.email, from.website].filter(Boolean).join(" · "))}</div>
    </div>`
    : "";

  // Cargo table rows: one per container line of a full-container quote (the type stands where a
  // package's packing does, with the cargo weight per box), then one per package line, with
  // per-line total weight and CBM.
  const containerRows = (data.containers ?? [])
    .map((c) => {
      const totalWeight = num(c.qty) * num(c.weight);
      return `<tr>
        <td>${esc(data.commodity) || "—"}</td>
        <td>${esc(c.type)} container</td>
        <td style="text-align:right">${esc(c.qty)}</td>
        <td style="text-align:right">—</td>
        <td style="text-align:right">${esc(c.weight) || "—"}</td>
        <td style="text-align:right">${totalWeight ? esc(Math.round(totalWeight * 100) / 100) : "—"}</td>
        <td style="text-align:right">—</td>
      </tr>`;
    })
    .join("");
  const packages: PackageLine[] = data.packages ?? [];
  const packageRows = packages
    .map((p: PackageLine) => {
      const totalWeight = num(p.qty) * num(p.weight);
      const cbm = (num(p.qty) * num(p.length) * num(p.width) * num(p.height)) / 1_000_000;
      return `<tr>
        <td>${esc(data.commodity) || "—"}</td>
        <td>${esc(p.type)}</td>
        <td style="text-align:right">${esc(p.qty)}</td>
        <td style="text-align:right">${esc(fmtDimensions(p)) || "—"}</td>
        <td style="text-align:right">${esc(p.weight) || "—"}</td>
        <td style="text-align:right">${totalWeight ? esc(Math.round(totalWeight * 100) / 100) : "—"}</td>
        <td style="text-align:right">${cbm ? esc(cbm.toFixed(3)) : "—"}</td>
      </tr>`;
    })
    .join("");
  const cargoRows = containerRows + packageRows;

  // Without package lines the cargo is the one weight and volume typed or imported for the whole
  // shipment - the figures the quote's own screens show for it then (computeCargo). Totals are
  // added up from the package lines, so there are none below that row - zeros there would
  // contradict it.
  const cargoBody =
    cargoRows ||
    `<tr>
      <td>${esc(data.commodity) || "—"}</td>
      <td>—</td>
      <td style="text-align:right">—</td>
      <td style="text-align:right">—</td>
      <td style="text-align:right">—</td>
      <td style="text-align:right">${cargo.grossWeight ? esc(cargo.grossWeight) : "—"}</td>
      <td style="text-align:right">${cargo.cbm ? esc(cargo.cbm) : "—"}</td>
    </tr>`;

  // A sum of weights or dimensions nobody entered is a dash like the lines above it, not a stated
  // "0 kg".
  const cargoFoot = cargoRows
    ? `<tfoot><tr class="totals">
        <td colspan="2">Totals</td>
        <td style="text-align:right">${esc(cargo.totalPackages || cargo.totalContainers)}</td>
        <td></td>
        <td></td>
        <td style="text-align:right">${cargo.grossWeight ? `${esc(cargo.grossWeight)} kg` : "—"}</td>
        <td style="text-align:right">${cargo.cbm ? esc(cargo.cbm) : "—"}</td>
      </tr></tfoot>`
    : "";

  // Chargeable weight is the air-freight rule (volume ÷ 6000 against gross weight); on a sea, road
  // or rail quote it would name a basis the price does not have.
  const chargeable =
    data.serviceType === "Air" && cargo.chargeableWeight
      ? `<div class="chargeable">Chargeable weight: <strong>${esc(cargo.chargeableWeight)} kg</strong></div>`
      : "";

  // Rate offer (selling) — never expose buying / cost / margin. Every line is shown in the quote's
  // currency, converted and rounded the way the total adds it up, so the lines sum to the total.
  // The customer reads a line by its description, not by its type (the charge code it is booked
  // under); a line nobody described keeps its type, so that no amount stands without a name.
  // The Overweight surcharge left at 0 (with a reason) is no charge: the customer does not see it.
  const sellingLines: CostLine[] = (data.sellingLines ?? []).filter((l) => !unpricedOverweight(l));
  const lineRows = sellingLines
    .map(
      (l: CostLine) => `<tr>
        <td>${esc(l.description?.trim() || l.type)}</td>
        <td style="text-align:right">${money(convertLine(l, data, sheet, { selling: true, live: exchange }))}</td>
      </tr>`,
    )
    .join("");
  // An all-in quote offers the total as one price.
  const allInRow = `<tr>
        <td>All-in rate</td>
        <td style="text-align:right">${money(totals.selling)}</td>
      </tr>`;
  const sellingRows = lineRows && data.allIn ? allInRow : lineRows;

  // A quote without selling lines has no price to offer yet, so its document has no rate offer:
  // a "Total price 0.00 EUR" in its place would read as the offer.
  const rateOffer = sellingRows
    ? `<h2>Rate offer</h2>
      <table>
        <thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${sellingRows}</tbody>
        <tfoot><tr class="totals"><td>Total</td><td style="text-align:right">${money(totals.selling)}</td></tr></tfoot>
      </table>${clause ? `<p class="fx-clause">${esc(clause)}</p>` : ""}`
    : "";

  // "Prepared by" and the signature name the owner for the customer: by name, not by the e-mail
  // the quote records them by (ownerNameForCustomer).
  const preparedBy = ownerNameForCustomer(data.salesOwner, people.users);
  const signature = [preparedBy, from.name].filter(Boolean).join(" · ");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(quoteNumber)}</title>
  <style>
    /* Backgrounds are part of the document - the header is white on dark - so they print as shown. */
    * { font-family: Arial, Helvetica, sans-serif; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
    .fx-clause { font-size: 11px; color: #64748b; margin-top: 6px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 13px; }
    .grid div span { color: #64748b; display: inline-block; width: 120px; }
    /* Text typed on several lines keeps its lines. */
    .text { white-space: pre-wrap; }
    .from { font-size: 13px; line-height: 1.5; }
    .from .name { font-size: 15px; font-weight: bold; }
    .route { font-size: 15px; font-weight: bold; margin: 4px 0 8px; }
    .route .arrow { color: #64748b; padding: 0 8px; }
    .chargeable { margin-top: 8px; font-size: 13px; color: #334155; }
    .chargeable strong { color: #1e293b; }
    .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .card { border-radius: 8px; padding: 14px 16px; font-size: 13px; }
    .card h3 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
    .card.includes { background: #f0fdf4; border: 1px solid #bbf7d0; }
    .card.includes h3 { color: #16a34a; }
    .card.excludes { background: #fef2f2; border: 1px solid #fecaca; }
    .card.excludes h3 { color: #dc2626; }
    .card.subject { grid-column: 1 / -1; background: #fffbeb; border: 1px solid #fde68a; }
    .card.subject h3 { color: #b45309; }
    .foot { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
    .foot .sign { margin-top: 12px; font-size: 13px; color: #1e293b; font-weight: bold; }
  </style></head><body>
    <div class="header">
      <div>
        <h1>Freight Quotation</h1>
        <div class="ref">${esc(quoteNumber)}</div>
        <div class="meta">${esc([data.serviceType, data.incoterm].filter(Boolean).join(" · "))}</div>
      </div>
      <div class="right">
        <div class="svc">Issued ${esc(issueDate)}</div>
        ${validUntil ? `<div class="meta">Valid until ${esc(validUntil)}</div>` : ""}
        ${preparedBy ? `<div class="meta">Prepared by: ${esc(preparedBy)}</div>` : ""}
      </div>
    </div>

    ${sender}

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
      <div><span>Cargo ready</span>${esc(cargoReady) || "—"}</div>
      <div><span>POL</span>${esc(data.pol) || "—"}</div>
      <div><span>POD</span>${esc(data.pod) || "—"}</div>
      <div><span>Pickup Address</span>${esc(data.pickup) || "—"}</div>
      <div><span>Delivery Address</span>${esc(data.delivery) || "—"}</div>
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
      ${cargoFoot}
    </table>
    ${chargeable}

    ${rateOffer}

    <h2>Shipping conditions</h2>
    <div class="cards">
      <div class="card includes"><h3>Includes</h3><div class="text">${esc(data.shippingIncludes) || "—"}</div></div>
      <div class="card excludes"><h3>Excludes</h3><div class="text">${esc(data.shippingExcludes) || "—"}</div></div>
      ${data.shippingSubjectTo?.trim() ? `<div class="card subject"><h3>Subject to</h3><div class="text">${esc(data.shippingSubjectTo)}</div></div>` : ""}
    </div>

    <div class="foot">
      This quotation is indicative and does not constitute a binding contract; rates are subject to space and equipment availability.
      ${signature ? `<div class="sign">${esc(signature)}</div>` : ""}
    </div>
  </body></html>`;

  return { html, blocked: null };
}

// Export PDF: hands the document to the browser's print dialog. Returns why that did not happen,
// or null once it did. `target` is a window opened beforehand - on the click, when the document is
// printed only after an answer from the server, so the browser does not take it for a pop-up.
export function printQuote(
  quoteNumber: string,
  data: SalesQuoteData,
  exchange: Pick<CurrentExchangeRates, "rates" | "isError" | "isLoading" | "roePct" | "fixingDate">,
  company: StoredCompanyDetails,
  people: QuoteDocumentUsers,
  target?: Window | null,
): string | null {
  const doc = quoteDocument(quoteNumber, data, exchange, company, people);
  if (doc.blocked !== null) {
    target?.close();
    return doc.blocked;
  }
  const w = target === undefined ? window.open("", "_blank") : target;
  // A blocked pop-up must not look like a button that does nothing.
  if (!w) return "The browser blocked the print window. Allow pop-ups for this site and try again.";
  w.document.write(doc.html);
  w.document.close();
  w.focus();
  w.print();
  return null;
}
