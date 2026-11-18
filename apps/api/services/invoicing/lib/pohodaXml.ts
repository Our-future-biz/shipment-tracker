import type { InvoiceLineRecord, InvoiceRecord } from "../schemas/invoice.schema";
import type { VatCode } from "../interfaces/interfaces";
import { EU_COUNTRIES, VAT_CODE_INFO, isVatCode, round2, toNumber } from "./invoiceCalc";
import { variableSymbol } from "./invoicePdf";

/**
 * Issued invoices and credit notes as a Pohoda (Stormware) XML import file (Accounts Receivable step 7): one
 * dat:dataPack, one dat:dataPackItem with an inv:invoice per document. Pure: the same documents always give the same
 * file. Every figure is the issued document's own (number, days, amounts, VAT summary, rate): nothing is recomputed
 * here, and a document whose own figures do not add up is left out (pohodaProblem) rather than "corrected".
 *
 * Read from Stormware's public documentation (18 Nov 2026):
 * - https://www.stormware.cz/schema/version_2/invoice.xsd   inv:invoice (links, cancelDocument, correctiveDocument,
 *   invoiceHeader, invoiceDetail, invoiceSummary in that order), invoiceType values incl. issuedInvoice and
 *   issuedCorrectiveTax, the header fields (xsd:all), invoiceItem, invoiceSummary (homeCurrency, foreignCurrency)
 * - https://www.stormware.cz/schema/version_2/type.xsd      numberType/numberRequested (1–32 chars, checkDuplicity
 *   true by default), address (company 255, street 64, city 45, zip 15, ico 15, dic 18, country refType), paymentType
 *   (draft = bank transfer), typeCurrencyHome (priceNone, priceLow…, priceHigh, priceHighVAT, priceHighSum),
 *   typeCurrencyForeign (currency, rate, amount, priceSum), correctiveDocumentType (sourceDocument/number, attribute
 *   itemTransfer, default true), vatRateType (none | high | low | third), typeRoundingVAT (noneEveryRate), symVar ≤ 20
 * - https://www.stormware.cz/xml/schema/version_2/data.xsd  dataPack (id, ico — must equal the IČO of the company in
 *   Pohoda —, application, version 2.0, note) and dataPackItem (id, version)
 * - https://www.stormware.cz/pohoda/xml/dokladyimport/ and the samples it lists, e.g.
 *   https://www.stormware.cz/xml/samples/version_2/import/Faktury/invoice_01_v2.0.xml (an invoice without items:
 *   homeCurrency summary), invoice_03_v2.0.xml (foreign currency: currency/ids, rate, amount, priceSum; items with
 *   foreignCurrency/unitPrice) and invoice_04_v2.0.xml. Every Stormware sample is encoded Windows-1250.
 * - https://www.stormware.cz/pohoda/xml/provyvojare/vypocetcastky/default.aspx  Pohoda checks and recomputes an item's
 *   amounts from unitPrice (payVAT false = the price is without VAT)
 * - The Členění DPH codes (UD, USregEU, UDpdp, UDzahr, UN) as a Pohoda export uses them:
 *   https://www.fakturoid.cz/podpora/ucetnictvi/cleneni-dph and row 21 / USregEU on
 *   https://portal.pohoda.cz/dane-ucetnictvi-mzdy/dph/trzby-a-souvisejici-radky-priznani-k-dph/
 *
 * Encoding: Stormware documents no UTF-8 import; its samples and Pohoda's own exports are Windows-1250, so the file is
 * written in Windows-1250 bytes (encodeWindows1250). A character Windows-1250 does not have (Chinese, an emoji) is
 * written as an XML character reference (&#20013;), which every XML reader turns back into the character.
 *
 * To confirm with the accountant on a test import (not decided here): the Členění DPH of 0 % §69 lines (no code is
 * set: Pohoda's default applies), whether Pohoda keeps the given VAT summary of a foreign-currency document, the
 * number series (numberRequested outside Pohoda's own series), the bank account (not set: Pohoda's default).
 */

export const POHODA_NS = {
  dat: "http://www.stormware.cz/schema/version_2/data.xsd",
  inv: "http://www.stormware.cz/schema/version_2/invoice.xsd",
  typ: "http://www.stormware.cz/schema/version_2/type.xsd",
} as const;

export const POHODA_APPLICATION = "Shipment Tracker";
export const POHODA_ENCODING = "Windows-1250";

/** Field lengths of type.xsd / invoice.xsd. */
const MAX = { number: 32, symVar: 20, text: 240, itemText: 90, itemNote: 90, company: 255, street: 64, city: 45, zip: 15, ico: 15, dic: 18 } as const;

/** What one document needs: the issued record, its lines, and for a credit note the number of the invoice it corrects. */
export interface PohodaDocument {
  invoice: Pick<
    InvoiceRecord,
    | "id"
    | "kind"
    | "number"
    | "issueDate"
    | "duzp"
    | "dueDate"
    | "currency"
    | "fxRate"
    | "net"
    | "vat"
    | "gross"
    | "netCzk"
    | "vatCzk"
    | "grossCzk"
    | "vatSummary"
    | "supplier"
    | "customer"
    | "shipment"
    | "note"
    | "creditReason"
  >;
  lines: Pick<InvoiceLineRecord, "seq" | "description" | "qty" | "unitPrice" | "unitCurrency" | "net" | "vatCode" | "vatRate">[];
  /** A credit note: the number of the invoice it corrects; null for an invoice */
  correctsNumber: string | null;
}

export interface PohodaPack {
  /** dataPack id (≤ 64): Pohoda checks duplicates by it and each item's id */
  id: string;
  /** The issuer's IČO: Pohoda refuses a file meant for another company */
  ico: string;
  /** Shown in Pohoda's XML Import agenda */
  note: string;
  documents: PohodaDocument[];
}

// ── Text ──────────────────────────────────────────────────────────────────────

// XML 1.0 allows tab, line feed, carriage return and U+0020 upwards (without the surrogates and U+FFFE/U+FFFF).
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

/** Text or an attribute value made safe for XML: & < > " ' escaped, characters XML may not hold dropped. */
export function escapeXml(value: string): string {
  return value
    .replace(NOT_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** At most `max` characters (whole characters, so a letter outside the BMP is never cut in half), trimmed. */
export function cut(value: string, max: number): string {
  const chars = [...(value ?? "").replace(/\s+/g, " ").trim()];
  return chars.length <= max ? chars.join("") : chars.slice(0, max).join("").trim();
}

/** An amount as Pohoda reads it: 2 decimals, a point, no grouping ("-1234.50"); never "-0.00". */
export function pohodaMoney(v: string | number): string {
  const n = round2(toNumber(v));
  return (n === 0 ? 0 : n).toFixed(2);
}

/** The stored ČNB rate as written (numeric(14,6) "25.125000" -> "25.125"): never rounded. */
export function pohodaRate(v: string | number): string {
  const text = String(v).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return String(toNumber(v));
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

const cents = (v: string | number) => Math.round(toNumber(v) * 100);

// ── VAT ───────────────────────────────────────────────────────────────────────

/** Pohoda's rate of an item: 21 % is the basic ("high") one; every other code of the app is 0 %. */
export function pohodaRateVat(code: VatCode): "high" | "none" {
  return code === "S21" ? "high" : "none";
}

const inEuAbroad = (country: string) => {
  const c = (country ?? "").trim().toUpperCase();
  return !!c && c !== "CZ" && EU_COUNTRIES.has(c);
};
const outsideEu = (country: string) => {
  const c = (country ?? "").trim().toUpperCase();
  return !!c && c !== "MC" && !EU_COUNTRIES.has(c);
};

/**
 * Pohoda's Členění DPH of a VAT code on a document for a customer whose seat is in `customerCountry`, or null when
 * none is set (Pohoda then uses its own default and the accountant picks one on import):
 * - S21 → UD (domestic supply)
 * - RC to a customer elsewhere in the EU → USregEU (service to an EU VAT payer, §9(1): VAT return row 21, EC Sales
 *   List code 3); RC to a Czech customer → UDpdp (domestic reverse charge)
 * - OUT to a customer outside the EU → UDzahr (place of supply outside the EU); OUT otherwise (a disbursement,
 *   outside the scope of VAT) → UN (not in the VAT return)
 * - Z69 (0 % §69, transport bound to import/export) and NP (the issuer is no VAT payer) → none: to confirm
 */
export function pohodaClassification(code: VatCode, customerCountry: string): string | null {
  switch (code) {
    case "S21":
      return "UD";
    case "RC":
      return inEuAbroad(customerCountry) ? "USregEU" : (customerCountry ?? "").trim().toUpperCase() === "CZ" ? "UDpdp" : null;
    case "OUT":
      return outsideEu(customerCountry) ? "UDzahr" : "UN";
    default:
      return null;
  }
}

/** The customer's country on the document (its billing address when it has one, as printed, else its seat). */
const partnerCountry = (doc: PohodaDocument) => (doc.invoice.customer.billingAddress?.country || doc.invoice.customer.country || "").trim().toUpperCase();

/** The VAT country rules use the seat (lib/invoiceCalc defaultVatCode decides by the seat). */
const seatCountry = (doc: PohodaDocument) => (doc.invoice.customer.country || "").trim().toUpperCase();

// ── Checks ────────────────────────────────────────────────────────────────────

/**
 * Why a document cannot go to Pohoda exactly as issued (it is then left out and named, never "fixed"), or null.
 * Checks that its own figures add up the way Pohoda adds them: the VAT summary to the totals, the lines to the
 * summary per VAT code (Pohoda builds its summary from the items), the CZK figures of a CZK document to its own.
 */
export function pohodaProblem(doc: PohodaDocument): string | null {
  const inv = doc.invoice;
  if (inv.kind !== "invoice" && inv.kind !== "credit_note") return `Unknown document kind "${inv.kind}"`;
  const number = (inv.number ?? "").trim();
  if (!number) return "The document has no number";
  if ([...number].length > MAX.number) return `The number is longer than Pohoda takes (${MAX.number} characters)`;
  if (inv.kind === "credit_note" && !(doc.correctsNumber ?? "").trim()) return "The invoice this credit note corrects could not be read";
  if (!/^[A-Z]{3}$/.test(inv.currency ?? "")) return `Unknown currency "${inv.currency}"`;
  if (!(toNumber(inv.fxRate) > 0)) return "The document has no exchange rate";
  if (inv.currency === "CZK" && toNumber(inv.fxRate) !== 1) return "A CZK document with a rate other than 1";

  const summary = inv.vatSummary ?? [];
  if (!summary.length) return "The document has no VAT summary";
  const seen = new Set<string>();
  for (const s of summary) {
    if (!isVatCode(s.vatCode)) return `Unknown VAT code "${String(s.vatCode)}" in the VAT summary`;
    if (seen.has(s.vatCode)) return `VAT code ${s.vatCode} twice in the VAT summary`;
    seen.add(s.vatCode);
    if (toNumber(s.vatRate) !== VAT_CODE_INFO[s.vatCode].rate) return `VAT code ${s.vatCode} with the rate ${s.vatRate} %`;
    if (VAT_CODE_INFO[s.vatCode].rate === 0 && (cents(s.vat) !== 0 || cents(s.vatCzk) !== 0)) return `VAT charged at 0 % (${s.vatCode})`;
  }
  const sum = (pick: (s: (typeof summary)[number]) => number) => summary.reduce((acc, s) => acc + cents(pick(s)), 0);
  if (sum((s) => s.base) !== cents(inv.net)) return "The VAT summary's bases do not add up to the net total";
  if (sum((s) => s.vat) !== cents(inv.vat)) return "The VAT summary's VAT does not add up to the VAT total";
  if (cents(inv.net) + cents(inv.vat) !== cents(inv.gross)) return "Net and VAT do not add up to the total";
  if (sum((s) => s.baseCzk) !== cents(inv.netCzk)) return "The VAT summary's CZK bases do not add up to the CZK net total";
  if (sum((s) => s.vatCzk) !== cents(inv.vatCzk)) return "The VAT summary's CZK VAT does not add up to the CZK VAT total";
  if (cents(inv.netCzk) + cents(inv.vatCzk) !== cents(inv.grossCzk)) return "The CZK net and VAT do not add up to the CZK total";
  if (inv.currency === "CZK" && summary.some((s) => cents(s.base) !== cents(s.baseCzk) || cents(s.vat) !== cents(s.vatCzk))) {
    return "A CZK document whose CZK figures differ from its own";
  }

  if (!doc.lines.length) return "The document has no lines";
  const byCode = new Map<string, number>();
  for (const l of doc.lines) {
    if (!isVatCode(l.vatCode)) return `Unknown VAT code "${String(l.vatCode)}" on line ${l.seq}`;
    if (toNumber(l.vatRate) !== VAT_CODE_INFO[l.vatCode].rate) return `Line ${l.seq}: VAT code ${l.vatCode} with the rate ${l.vatRate} %`;
    byCode.set(l.vatCode, (byCode.get(l.vatCode) ?? 0) + cents(l.net));
  }
  for (const s of summary) {
    if ((byCode.get(s.vatCode) ?? 0) !== cents(s.base)) return `The lines at ${VAT_CODE_INFO[s.vatCode].label} do not add up to the VAT summary`;
    byCode.delete(s.vatCode);
  }
  if ([...byCode.values()].some((v) => v !== 0)) return "A line's VAT code is not in the VAT summary";
  return null;
}

/**
 * What the accountant should look at after importing the document, though it goes as issued ("" when nothing): codes
 * with no Členění DPH, a VAT that Pohoda's own rounding could compute otherwise, an address cut to Pohoda's length.
 */
export function pohodaNotes(doc: PohodaDocument): string[] {
  const inv = doc.invoice;
  const notes: string[] = [];
  const country = seatCountry(doc);
  const unclassified = [...new Set(inv.vatSummary.filter((s) => isVatCode(s.vatCode) && pohodaClassification(s.vatCode, country) === null).map((s) => VAT_CODE_INFO[s.vatCode].label))];
  if (unclassified.length) notes.push(`no Členění DPH set for ${unclassified.join(", ")}: pick it in Pohoda`);
  for (const s of inv.vatSummary) {
    if (s.vatCode !== "S21") continue;
    // Pohoda computes the VAT of a rate from the base of that rate (roundingVAT noneEveryRate), as the app did.
    if (cents(s.vat) !== cents(round2((toNumber(s.base) * 21) / 100))) notes.push("its 21 % VAT is not 21 % of its base rounded: compare the VAT in Pohoda");
    if (inv.currency !== "CZK") notes.push(`21 % VAT in ${inv.currency}: compare Pohoda's CZK VAT with ${pohodaMoney(s.vatCzk)} CZK`);
  }
  const p = partner(doc);
  if (p.cutFields.length) notes.push(`the customer's ${p.cutFields.join(", ")} cut to Pohoda's length`);
  return notes;
}

// ── The file ──────────────────────────────────────────────────────────────────

interface Partner {
  company: string;
  street: string;
  city: string;
  zip: string;
  ico: string;
  dic: string;
  country: string;
  cutFields: string[];
}

/** The customer as the document prints it: at its billing address when it has one, else at its seat. */
function partner(doc: PohodaDocument): Partner {
  const c = doc.invoice.customer;
  const bill = c.billingAddress;
  const raw = {
    company: c.companyName ?? "",
    street: bill ? bill.street : (c.address ?? ""),
    city: bill ? bill.city : (c.city ?? ""),
    zip: bill ? bill.postalCode : "",
    ico: c.ico ?? "",
    dic: c.dic ?? "",
  };
  const cutFields: string[] = [];
  const fit = (key: keyof typeof raw, max: number) => {
    const clean = cut(raw[key], Number.MAX_SAFE_INTEGER);
    const value = cut(clean, max);
    if (value !== clean) cutFields.push(key === "zip" ? "postcode" : key === "ico" ? "IČO" : key === "dic" ? "DIČ" : key);
    return value;
  };
  return {
    company: fit("company", MAX.company),
    street: fit("street", MAX.street),
    city: fit("city", MAX.city),
    zip: fit("zip", MAX.zip),
    ico: fit("ico", MAX.ico),
    dic: fit("dic", MAX.dic),
    country: partnerCountry(doc),
    cutFields,
  };
}

class Xml {
  private out: string[] = [];
  private depth = 0;
  open(tag: string, attrs: Record<string, string> = {}) {
    this.out.push(`${"  ".repeat(this.depth)}<${tag}${attrText(attrs)}>`);
    this.depth++;
    return this;
  }
  close(tag: string) {
    this.depth--;
    this.out.push(`${"  ".repeat(this.depth)}</${tag}>`);
    return this;
  }
  /** An element with text; left out when the text is empty. */
  leaf(tag: string, text: string, attrs: Record<string, string> = {}) {
    if (text === "") return this;
    this.out.push(`${"  ".repeat(this.depth)}<${tag}${attrText(attrs)}>${escapeXml(text)}</${tag}>`);
    return this;
  }
  /** <tag><typ:ids>code</typ:ids></tag> — a reference to one of Pohoda's lists by its code. */
  ref(tag: string, ids: string) {
    if (!ids) return this;
    return this.open(tag).leaf("typ:ids", ids).close(tag);
  }
  toString() {
    return this.out.join("\n");
  }
}

const attrText = (attrs: Record<string, string>) =>
  Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join("");

/** The header text: what the document is for (≤ 240). */
function headerText(doc: PohodaDocument): string {
  const inv = doc.invoice;
  const s = inv.shipment;
  if (inv.kind === "credit_note") {
    const reason = cut(inv.creditReason ?? "", MAX.text);
    return cut(`Oprava faktury ${doc.correctsNumber ?? ""}${reason ? `: ${reason}` : ""} (zakázka ${s.jobNumber})`, MAX.text);
  }
  const route = s.routeFrom || s.routeTo ? `, ${s.routeFrom || "-"} - ${s.routeTo || "-"}` : "";
  return cut(`Zakázka ${s.jobNumber}${route}`, MAX.text);
}

/** The internal note: where the document comes from and its ČNB rate, for the accountant. */
function internalNote(doc: PohodaDocument): string {
  const inv = doc.invoice;
  const kind = inv.kind === "credit_note" ? "Opravný daňový doklad" : "Faktura";
  const rate = inv.currency === "CZK" ? "" : `; kurz ČNB k DUZP 1 ${inv.currency} = ${pohodaRate(inv.fxRate)} CZK`;
  return `${kind} ${inv.number} ze Shipment Tracker, zakázka ${inv.shipment.jobNumber}${rate}`;
}

/** An item's note when the item's single price does not show it all: "2 x 150.00 EUR". */
function itemNote(line: PohodaDocument["lines"][number], currency: string): string {
  const qty = toNumber(line.qty);
  const unitPrice = toNumber(line.unitPrice);
  if (qty === 1 && line.unitCurrency === currency && cents(unitPrice) === cents(line.net)) return "";
  const qtyText = Number.isInteger(qty) ? String(qty) : qty.toFixed(2);
  return cut(`${qtyText} x ${pohodaMoney(unitPrice)} ${line.unitCurrency}`, MAX.itemNote);
}

function writeDocument(x: Xml, doc: PohodaDocument) {
  const inv = doc.invoice;
  const home = inv.currency === "CZK";
  const credit = inv.kind === "credit_note";
  const country = seatCountry(doc);
  const summary = inv.vatSummary;
  const codes = [...new Set(summary.map((s) => pohodaClassification(s.vatCode, country)))];

  x.open("dat:dataPackItem", { id: cut(inv.number, 64), version: "2.0" }).open("inv:invoice", { version: "2.0" });

  // A credit note: Pohoda makes a corrective tax document of the invoice with this number (which must be in Pohoda
  // already), with the credit note's own items, not the invoice's (itemTransfer false).
  if (credit) {
    x.open("inv:correctiveDocument", { itemTransfer: "false" }).open("typ:sourceDocument").leaf("typ:number", doc.correctsNumber ?? "").close("typ:sourceDocument").close("inv:correctiveDocument");
  }

  x.open("inv:invoiceHeader");
  x.leaf("inv:invoiceType", credit ? "issuedCorrectiveTax" : "issuedInvoice");
  // The app's own number, kept by Pohoda (checkDuplicity: a number Pohoda has already is refused, never doubled).
  x.open("inv:number").leaf("typ:numberRequested", inv.number, { checkDuplicity: "true" }).close("inv:number");
  x.leaf("inv:symVar", cut(variableSymbol(inv.shipment.jobNumber), MAX.symVar));
  x.leaf("inv:date", inv.issueDate);
  x.leaf("inv:dateTax", inv.duzp);
  x.leaf("inv:dateAccounting", inv.issueDate);
  x.leaf("inv:dateDue", inv.dueDate);
  // One Členění DPH for the whole document only when all its VAT codes have the same one; else each item has its own.
  if (codes.length === 1 && codes[0]) x.ref("inv:classificationVAT", codes[0]);
  x.leaf("inv:text", headerText(doc));

  const p = partner(doc);
  x.open("inv:partnerIdentity").open("typ:address");
  x.leaf("typ:company", p.company).leaf("typ:city", p.city).leaf("typ:street", p.street).leaf("typ:zip", p.zip).leaf("typ:ico", p.ico).leaf("typ:dic", p.dic);
  x.ref("typ:country", p.country);
  x.close("typ:address").close("inv:partnerIdentity");

  x.open("inv:paymentType").leaf("typ:paymentType", "draft").close("inv:paymentType");
  x.leaf("inv:note", cut(inv.note ?? "", 2000));
  x.leaf("inv:intNote", internalNote(doc));
  x.close("inv:invoiceHeader");

  // Items: one per line, its total in the document's currency as a single price without VAT (quantity 1), so the
  // item's amount is exactly the line's; the line's own quantity and price go in the item's note.
  x.open("inv:invoiceDetail");
  for (const line of [...doc.lines].sort((a, b) => a.seq - b.seq)) {
    const code = line.vatCode;
    x.open("inv:invoiceItem");
    x.leaf("inv:text", cut(line.description, MAX.itemText) || "Služba");
    x.leaf("inv:quantity", "1");
    x.leaf("inv:payVAT", "false");
    x.leaf("inv:rateVAT", pohodaRateVat(code));
    x.open(home ? "inv:homeCurrency" : "inv:foreignCurrency").leaf("typ:unitPrice", pohodaMoney(line.net)).close(home ? "inv:homeCurrency" : "inv:foreignCurrency");
    x.leaf("inv:note", itemNote(line, inv.currency));
    const lineCode = pohodaClassification(code, country);
    if (lineCode) x.ref("inv:classificationVAT", lineCode);
    x.close("inv:invoiceItem");
  }
  x.close("inv:invoiceDetail");

  // The summary: the document's own VAT summary in CZK (homeCurrency) and, in a foreign currency, its total there.
  const czk = (pick: (s: (typeof summary)[number]) => string | number, filter: (code: VatCode) => boolean) =>
    pohodaMoney(summary.filter((s) => filter(s.vatCode)).reduce((acc, s) => acc + cents(pick(s)), 0) / 100);
  const zero = (code: VatCode) => pohodaRateVat(code) === "none";
  const high = (code: VatCode) => code === "S21";
  x.open("inv:invoiceSummary");
  x.leaf("inv:roundingDocument", "none");
  x.leaf("inv:roundingVAT", "noneEveryRate");
  x.open("inv:homeCurrency");
  if (summary.some((s) => zero(s.vatCode))) x.leaf("typ:priceNone", czk((s) => s.baseCzk, zero));
  if (summary.some((s) => high(s.vatCode))) {
    x.leaf("typ:priceHigh", czk((s) => s.baseCzk, high));
    x.leaf("typ:priceHighVAT", czk((s) => s.vatCzk, high));
    x.leaf("typ:priceHighSum", pohodaMoney((cents(czk((s) => s.baseCzk, high)) + cents(czk((s) => s.vatCzk, high))) / 100));
  }
  x.close("inv:homeCurrency");
  if (!home) {
    x.open("inv:foreignCurrency");
    x.ref("typ:currency", inv.currency);
    x.leaf("typ:rate", pohodaRate(inv.fxRate));
    x.leaf("typ:amount", "1");
    x.leaf("typ:priceSum", pohodaMoney(inv.gross));
    x.close("inv:foreignCurrency");
  }
  x.close("inv:invoiceSummary");

  x.close("inv:invoice").close("dat:dataPackItem");
}

/**
 * The order documents go in: by issue day, an invoice before the credit notes of the same day (Pohoda finds the
 * invoice a credit note corrects among what it already has), then by number.
 */
export function pohodaOrder(a: PohodaDocument, b: PohodaDocument): number {
  const ai = a.invoice;
  const bi = b.invoice;
  if (ai.issueDate !== bi.issueDate) return ai.issueDate < bi.issueDate ? -1 : 1;
  if (ai.kind !== bi.kind) return ai.kind === "invoice" ? -1 : 1;
  return ai.number < bi.number ? -1 : ai.number > bi.number ? 1 : 0;
}

/** The dataPack as text (Unicode); encodeWindows1250 makes the file's bytes. Documents with a pohodaProblem must be left out first. */
export function buildPohodaXml(pack: PohodaPack): string {
  const x = new Xml();
  const attrs: Record<string, string> = { version: "2.0", id: cut(pack.id, 64) };
  if (pack.ico.trim()) attrs.ico = cut(pack.ico, MAX.ico);
  attrs.application = POHODA_APPLICATION;
  attrs.note = pack.note;
  x.open("dat:dataPack", { ...attrs, "xmlns:dat": POHODA_NS.dat, "xmlns:inv": POHODA_NS.inv, "xmlns:typ": POHODA_NS.typ });
  for (const doc of [...pack.documents].sort(pohodaOrder)) writeDocument(x, doc);
  x.close("dat:dataPack");
  return `<?xml version="1.0" encoding="${POHODA_ENCODING}"?>\n${x.toString()}\n`;
}

// ── Windows-1250 ──────────────────────────────────────────────────────────────

let toCp1250: Map<number, number> | null = null;

/** Unicode code point → Windows-1250 byte for 0x80–0xFF, read from the platform's own decoder (WHATWG windows-1250). */
function cp1250Table(): Map<number, number> {
  if (toCp1250) return toCp1250;
  const decoder = new TextDecoder("windows-1250");
  const map = new Map<number, number>();
  for (let b = 0x80; b <= 0xff; b++) {
    const cp = decoder.decode(Uint8Array.of(b)).codePointAt(0)!;
    // The bytes Windows-1250 leaves undefined decode to C1 controls; XML text has no use for them.
    if (cp >= 0xa0 && cp !== 0xfffd) map.set(cp, b);
  }
  toCp1250 = map;
  return map;
}

/**
 * The XML text as Windows-1250 bytes. ASCII stays as it is; Czech letters (and the rest of Windows-1250) become their
 * byte; any other character becomes an XML character reference, so nothing is lost or turned into "?". Only for the
 * output of buildPohodaXml (its markup is ASCII, so a reference only ever lands in text or an attribute value).
 */
export function encodeWindows1250(xml: string): Buffer {
  const table = cp1250Table();
  const bytes: number[] = [];
  for (const ch of xml) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) {
      bytes.push(cp);
      continue;
    }
    const b = table.get(cp);
    if (b !== undefined) bytes.push(b);
    else for (const c of `&#${cp};`) bytes.push(c.charCodeAt(0));
  }
  return Buffer.from(bytes);
}

/** "pohoda-invoices-2026-11-01-2026-11-30.xml" */
export function pohodaFileName(from: string, to: string): string {
  return `pohoda-invoices-${from}-${to}.xml`;
}
