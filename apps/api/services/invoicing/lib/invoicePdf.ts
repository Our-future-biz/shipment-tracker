import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import type { CustomerSnapshot, ShipmentSnapshot, SupplierSnapshot, VatSummarySnapshot } from "../schemas/invoice.schema";
import { VAT_CODE_INFO, isVatCode } from "./invoiceCalc";

/**
 * The customer-facing PDF of an issued invoice or credit note: bilingual (Czech / English),
 * with every field §29 ZDPH requires. Rendered only from the stored snapshot, so the same
 * invoice always gives the same document. Fonts are passed in (DejaVu Sans covers Czech
 * diacritics; the built-in PDF fonts do not).
 */

/** Bump when the layout changes; stored with every PDF. */
export const PDF_TEMPLATE_VERSION = "2";

export interface InvoicePdfLine {
  description: string;
  qty: string;
  unitPrice: string;
  unitCurrency: string;
  net: string;
  vatCode: string;
  vatRate: string;
}

export interface InvoiceForPdf {
  kind: string;
  number: string;
  issueDate: string;
  duzp: string;
  dueDate: string;
  currency: string;
  fxRate: string;
  fxWeek: string;
  fxFixingDate: string | null;
  roePct: string | null;
  net: string;
  vat: string;
  gross: string;
  netCzk: string;
  vatCzk: string;
  grossCzk: string;
  vatSummary: VatSummarySnapshot[];
  supplier: SupplierSnapshot;
  customer: CustomerSnapshot;
  shipment: ShipmentSnapshot;
  note: string;
  creditReason: string;
  /** Number of the invoice a credit note corrects */
  correctsNumber: string;
  lines: InvoicePdfLine[];
}

export interface PdfFonts {
  regular: Uint8Array;
  bold: Uint8Array;
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** 29999.5 -> "29 999,50" (Czech style, plain spaces so every font can print it). */
export function czMoney(v: string | number): string {
  const n = typeof v === "number" ? v : Number(v);
  const fixed = (Number.isFinite(n) ? n : 0).toFixed(2);
  const [int, dec] = fixed.split(".");
  const neg = int!.startsWith("-");
  const digits = neg ? int!.slice(1) : int!;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg && Number(fixed) !== 0 ? "-" : ""}${grouped},${dec}`;
}

/** Exchange rate with 3 decimals, Czech style: 25.12345 -> "25,123" */
export function czRate(v: string | number): string {
  const n = typeof v === "number" ? v : Number(v);
  return (Number.isFinite(n) ? n : 0).toFixed(3).replace(".", ",");
}

/** "2026-11-07" -> "07.11.2026" (DD.MM.YYYY, as everywhere else in the app) */
export function czDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/**
 * Variabilní symbol (max. 10 digits) for the bank transfer: the job number's digits
 * (owner's decision, 2026-10-24), e.g. CZ00000028 -> 00000028. Every invoice and credit note
 * of a job carries the same symbol.
 */
export function variableSymbol(jobNumber: string): string {
  return jobNumber.replace(/\D/g, "").slice(-10);
}

/**
 * Czech IBAN from a domestic account number "[prefix-]number/bank", e.g. 19-2000145399/0800
 * -> CZ6508000000192000145399; null when it is not one.
 */
export function czIbanFromAccount(account: string): string | null {
  const m = /^\s*(?:(\d{1,6})-)?(\d{2,10})\s*\/\s*(\d{4})\s*$/.exec(account);
  if (!m) return null;
  const bban = `${m[3]}${(m[1] ?? "").padStart(6, "0")}${m[2]!.padStart(10, "0")}`;
  // ISO 13616 check digits: BBAN + "CZ00" with letters as numbers (C=12, Z=35), mod 97
  const digits = `${bban}123500`;
  let rest = 0;
  for (const ch of digits) rest = (rest * 10 + Number(ch)) % 97;
  return `CZ${String(98 - rest).padStart(2, "0")}${bban}`;
}

/**
 * The Czech "QR Platba" payment string (Short Payment Descriptor, as banking apps read it),
 * or null when the account has no IBAN to pay to.
 */
export function spdPayment(p: { iban: string; swift?: string; amount: number; currency: string; vs: string; message: string }): string | null {
  const iban = p.iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) || !(p.amount > 0)) return null;
  // "*" separates the fields, so it may not appear inside one; keep the message plain ASCII
  const clean = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "").replace(/\*/g, "").trim();
  const parts = [
    "SPD*1.0",
    `ACC:${iban}${p.swift ? `+${clean(p.swift).toUpperCase()}` : ""}`,
    `AM:${p.amount.toFixed(2)}`,
    `CC:${p.currency.toUpperCase()}`,
    p.vs ? `X-VS:${p.vs}` : "",
    `MSG:${clean(p.message).slice(0, 60)}`,
  ].filter(Boolean);
  return parts.join("*");
}

const DARK = rgb(0.11, 0.13, 0.2);
const MUTED = rgb(0.4, 0.43, 0.5);
const LINE = rgb(0.85, 0.87, 0.9);
const ZEBRA = rgb(0.965, 0.97, 0.98);
const ACCENT = rgb(0.25, 0.3, 0.75);

const A4 = { w: 595.28, h: 841.89 };
const M = 40; // page margin

// ── Renderer ──────────────────────────────────────────────────────────────────

class Writer {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;

  constructor(
    private doc: PDFDocument,
    public regular: PDFFont,
    public bold: PDFFont,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.pages.push(this.page);
    this.y = A4.h - M;
  }

  /** Starts a new page when fewer than `needed` points are left above the footer. */
  ensure(needed: number) {
    if (this.y - needed < M + 40) this.newPage();
  }

  text(t: string, x: number, y: number, size: number, opts: { bold?: boolean; color?: ReturnType<typeof rgb>; align?: "left" | "right" } = {}) {
    const font = opts.bold ? this.bold : this.regular;
    const clean = t.replace(/[  ]/g, " ");
    const width = font.widthOfTextAtSize(clean, size);
    this.page.drawText(clean, { x: opts.align === "right" ? x - width : x, y, size, font, color: opts.color ?? DARK });
  }

  /** Splits text into lines that fit `maxWidth`. */
  wrap(t: string, size: number, maxWidth: number, bold = false): string[] {
    const font = bold ? this.bold : this.regular;
    const out: string[] = [];
    for (const para of t.split(/\r?\n/)) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
        else {
          if (line) out.push(line);
          // a single word longer than the line is cut
          let w = word;
          while (font.widthOfTextAtSize(w, size) > maxWidth && w.length > 1) {
            let cut = w.length - 1;
            while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut--;
            out.push(w.slice(0, cut));
            w = w.slice(cut);
          }
          line = w;
        }
      }
      if (line) out.push(line);
    }
    return out.length ? out : [""];
  }

  hline(x1: number, x2: number, y: number, color = LINE, thickness = 0.6) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
  }

  rect(x: number, y: number, w: number, h: number, color: ReturnType<typeof rgb>, border?: ReturnType<typeof rgb>) {
    this.page.drawRectangle({ x, y, width: w, height: h, color, borderColor: border, borderWidth: border ? 0.6 : 0 });
  }
}

async function embedLogo(doc: PDFDocument, dataUrl: string): Promise<PDFImage | null> {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  try {
    const bytes = Buffer.from(m[2]!, "base64");
    return m[1] === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null; // a broken logo must never stop the invoice
  }
}

/** Address block lines of a party (empty parts left out). */
function partyLines(p: { address: string; city: string; postalCode?: string; country: string; ico: string; dic: string }) {
  const lines: string[] = [];
  if (p.address) lines.push(p.address);
  const cityLine = [p.postalCode, p.city].filter(Boolean).join(" ");
  // the customer's registry address often already contains the city
  if (cityLine && !p.address.includes(p.city)) lines.push(cityLine);
  if (p.country && p.country !== "CZ") lines.push(p.country);
  if (p.ico) lines.push(`IČO: ${p.ico}`);
  if (p.dic) lines.push(`DIČ: ${p.dic}`);
  return lines;
}

export async function renderInvoicePdf(inv: InvoiceForPdf, fonts: PdfFonts): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  const isCredit = inv.kind === "credit_note";
  doc.setTitle(`${isCredit ? "Credit note" : "Invoice"} ${inv.number}`);
  doc.setAuthor(inv.supplier.companyName);
  doc.setCreator("Shipment Tracker");
  doc.setCreationDate(new Date(`${inv.issueDate}T00:00:00Z`));
  doc.setModificationDate(new Date(`${inv.issueDate}T00:00:00Z`));

  const w = new Writer(doc, regular, bold);
  const right = A4.w - M;
  const s = inv.supplier;
  const foreign = inv.currency !== "CZK";

  // ── Header: logo + document title + number ──
  const title = isCredit ? "OPRAVNÝ DAŇOVÝ DOKLAD" : "FAKTURA – DAŇOVÝ DOKLAD";
  const subtitle = isCredit ? "Credit note" : "Invoice – tax document";
  // the title block on the right; the company name on the left keeps clear of it
  const titleW = Math.max(bold.widthOfTextAtSize(title, 13), regular.widthOfTextAtSize(subtitle, 9), bold.widthOfTextAtSize(inv.number, 15));
  const nameMax = right - M - titleW - 24;
  let headerH = 62;
  const logo = await embedLogo(doc, s.logoData);
  if (logo) {
    const scale = Math.min(150 / logo.width, 48 / logo.height, nameMax / logo.width, 1);
    w.page.drawImage(logo, { x: M, y: w.y - logo.height * scale, width: logo.width * scale, height: logo.height * scale });
  } else {
    // a long name wraps; past two lines it gets smaller
    let size = 14;
    let nameLines = w.wrap(s.companyName, size, nameMax, true);
    if (nameLines.length > 2) {
      size = 11;
      nameLines = w.wrap(s.companyName, size, nameMax, true);
    }
    nameLines.forEach((l, i) => w.text(l, M, w.y - 16 - i * (size + 3), size, { bold: true }));
    headerH = Math.max(headerH, 16 + (nameLines.length - 1) * (size + 3) + 14);
  }
  w.text(title, right, w.y - 12, 13, { bold: true, align: "right" });
  w.text(subtitle, right, w.y - 26, 9, { color: MUTED, align: "right" });
  w.text(inv.number, right, w.y - 44, 15, { bold: true, color: ACCENT, align: "right" });
  w.y -= headerH;
  w.hline(M, right, w.y, ACCENT, 1.2);
  w.y -= 16;

  // ── Parties ──
  const colW = (right - M - 16) / 2;
  const supplierBlock = [s.companyName, ...partyLines({ ...s, address: s.street })];
  const customerBlock = [inv.customer.companyName, ...partyLines({ ...inv.customer })];
  const partyTop = w.y;
  const drawParty = (x: number, label: string, lines: string[]) => {
    w.text(label, x + 10, partyTop - 14, 7.5, { bold: true, color: MUTED });
    let y = partyTop - 30;
    lines.forEach((l, i) => {
      for (const part of w.wrap(l, i === 0 ? 10.5 : 9, colW - 20, i === 0)) {
        w.text(part, x + 10, y, i === 0 ? 10.5 : 9, { bold: i === 0 });
        y -= i === 0 ? 14 : 12;
      }
    });
    return partyTop - y;
  };
  const hS = drawParty(M, "DODAVATEL / SUPPLIER", supplierBlock);
  const hC = drawParty(M + colW + 16, "ODBĚRATEL / CUSTOMER", customerBlock);
  const boxH = Math.max(hS, hC) + 4;
  w.page.drawRectangle({ x: M, y: partyTop - boxH, width: colW, height: boxH, borderColor: LINE, borderWidth: 0.8 });
  w.page.drawRectangle({ x: M + colW + 16, y: partyTop - boxH, width: colW, height: boxH, borderColor: ACCENT, borderWidth: 0.8 });
  w.y = partyTop - boxH - 8;
  if (s.registerEntry) {
    for (const l of w.wrap(s.registerEntry, 7.5, colW)) {
      w.text(l, M, w.y - 8, 7.5, { color: MUTED });
      w.y -= 10;
    }
  }
  w.y -= 14;

  // ── Dates, payment, references ──
  const bank = s.bankAccount;
  const left: [string, string][] = [
    ["Datum vystavení / Issue date", czDate(inv.issueDate)],
    ["DUZP / Tax point date", czDate(inv.duzp)],
    ["Datum splatnosti / Due date", czDate(inv.dueDate)],
    ["Forma úhrady / Payment", "Převodem / Bank transfer"],
    ["Variabilní symbol / Payment ref.", variableSymbol(inv.shipment.jobNumber)],
  ];
  const rightCol: [string, string][] = [];
  if (bank?.bankName) rightCol.push(["Banka / Bank", bank.bankName]);
  if (bank?.accountNumber) rightCol.push(["Číslo účtu / Account no.", bank.accountNumber]);
  if (bank?.iban) rightCol.push(["IBAN", bank.iban.replace(/(.{4})/g, "$1 ").trim()]);
  if (bank?.swift) rightCol.push(["SWIFT / BIC", bank.swift]);
  rightCol.push(["Zakázka / Job", inv.shipment.jobNumber]);
  if (inv.shipment.containerNumber) rightCol.push(["Kontejner / Container", inv.shipment.containerNumber]);
  if (inv.shipment.bookingNumber) rightCol.push(["Booking", inv.shipment.bookingNumber]);
  if (inv.shipment.personalReference) rightCol.push(["Vaše ref. / Your ref.", inv.shipment.personalReference]);
  if (isCredit && inv.correctsNumber) rightCol.unshift(["K faktuře / Corrects invoice", inv.correctsNumber]);

  const infoTop = w.y;
  const drawInfo = (x: number, rows: [string, string][]) => {
    let y = infoTop;
    for (const [k, v] of rows) {
      w.text(k, x, y, 7.5, { color: MUTED });
      const avail = colW - 4;
      if (regular.widthOfTextAtSize(k, 7.5) + 10 + bold.widthOfTextAtSize(v, 9) <= avail) {
        w.text(v, x + avail, y, 9, { bold: true, align: "right" });
        y -= 14;
      } else {
        // too long to share the line with its label: under it, right-aligned
        y -= 11;
        for (const part of w.wrap(v, 9, avail, true)) {
          w.text(part, x + avail, y, 9, { bold: true, align: "right" });
          y -= 12;
        }
        y -= 2;
      }
    }
    return infoTop - y;
  };
  const infoH = Math.max(drawInfo(M, left), drawInfo(M + colW + 16, rightCol));
  w.y = infoTop - infoH - 6;

  if (isCredit && inv.creditReason) {
    for (const l of w.wrap(`Důvod opravy / Reason: ${inv.creditReason}`, 9, right - M)) {
      w.text(l, M, w.y, 9);
      w.y -= 12;
    }
  }
  w.y -= 10;

  // ── Lines ──
  // right edges of the number columns (DejaVu is wide: the Net header needs ~100 pt)
  const cols = { desc: M + 6, qty: M + 250, unit: M + 345, vat: M + 405, net: right - 6 };
  const tableHeader = () => {
    w.rect(M, w.y - 22, right - M, 22, rgb(0.93, 0.94, 0.99));
    w.text("Popis / Description", cols.desc, w.y - 14, 8, { bold: true, color: MUTED });
    w.text("Množství / Qty", cols.qty, w.y - 14, 8, { bold: true, color: MUTED, align: "right" });
    w.text("Cena / Price", cols.unit, w.y - 14, 8, { bold: true, color: MUTED, align: "right" });
    w.text("DPH / VAT", cols.vat, w.y - 14, 8, { bold: true, color: MUTED, align: "right" });
    w.text(`Základ / Net (${inv.currency})`, cols.net, w.y - 14, 8, { bold: true, color: MUTED, align: "right" });
    w.y -= 22;
  };
  tableHeader();
  // the VAT label has the room between the price and the Net header; longer ones wrap
  const vatMax = cols.vat - cols.unit - 8;
  const priceMax = cols.unit - cols.qty - 8;
  inv.lines.forEach((l, i) => {
    const descLines = w.wrap(l.description, 9, cols.qty - cols.desc - 70);
    const vatLabel = isVatCode(l.vatCode) ? VAT_CODE_INFO[l.vatCode].label : l.vatCode;
    const vatLines = w.wrap(vatLabel, 8, vatMax);
    const rowH = 8 + Math.max(descLines.length, vatLines.length) * 12;
    if (w.y - rowH < M + 60) {
      w.newPage();
      tableHeader();
    }
    if (i % 2 === 1) w.rect(M, w.y - rowH, right - M, rowH, ZEBRA);
    descLines.forEach((d, j) => w.text(d, cols.desc, w.y - 13 - j * 12, 9));
    w.text(czMoney(l.qty).replace(/,00$/, ""), cols.qty, w.y - 13, 9, { align: "right" });
    const price = `${czMoney(l.unitPrice)} ${l.unitCurrency}`;
    w.text(price, cols.unit, w.y - 13, regular.widthOfTextAtSize(price, 9) <= priceMax ? 9 : 7.5, { align: "right" });
    vatLines.forEach((v, j) => w.text(v, cols.vat, w.y - 13 - j * 12, 8, { align: "right", color: MUTED }));
    w.text(czMoney(l.net), cols.net, w.y - 13, 9, { align: "right" });
    w.y -= rowH;
  });
  w.hline(M, right, w.y);
  w.y -= 16;

  // ── VAT recap + totals ──
  const recapRows = inv.vatSummary.length + 1;
  w.ensure(recapRows * 13 + 120 + (isCredit ? 0 : 96));
  const recapTop = w.y;
  w.text("Rekapitulace DPH / VAT summary", M, w.y, 8, { bold: true, color: MUTED });
  w.y -= 14;
  const rc = foreign
    ? { rate: M, base: M + 115, vat: M + 168, baseCzk: M + 238, vatCzk: M + 290 }
    : { rate: M, base: M + 110, vat: M + 170, baseCzk: 0, vatCzk: 0 };
  w.text("Sazba / Rate", rc.rate, w.y, 7.5, { color: MUTED });
  w.text(`Základ ${inv.currency}`, rc.base, w.y, 7.5, { color: MUTED, align: "right" });
  w.text(`DPH ${inv.currency}`, rc.vat, w.y, 7.5, { color: MUTED, align: "right" });
  if (foreign) {
    w.text("Základ CZK", rc.baseCzk, w.y, 7.5, { color: MUTED, align: "right" });
    w.text("DPH CZK", rc.vatCzk, w.y, 7.5, { color: MUTED, align: "right" });
  }
  w.y -= 4;
  w.hline(M, rc.vatCzk || rc.vat, w.y);
  for (const v of inv.vatSummary) {
    w.y -= 12;
    const label = isVatCode(v.vatCode) ? VAT_CODE_INFO[v.vatCode].label : v.vatCode;
    w.text(label, rc.rate, w.y, 8.5);
    w.text(czMoney(v.base), rc.base, w.y, 8.5, { align: "right" });
    w.text(czMoney(v.vat), rc.vat, w.y, 8.5, { align: "right" });
    if (foreign) {
      w.text(czMoney(v.baseCzk), rc.baseCzk, w.y, 8.5, { align: "right" });
      w.text(czMoney(v.vatCzk), rc.vatCzk, w.y, 8.5, { align: "right" });
    }
  }
  // the notes under the recap stay left of the totals box
  const tx = M + (foreign ? 330 : 300);
  const noteMax = tx - 16 - M;
  const note = (t: string) => {
    for (const l of w.wrap(t, 8, noteMax)) {
      w.y -= 11;
      w.text(l, M, w.y, 8, { color: MUTED });
    }
  };
  if (foreign) {
    w.y -= 5;
    // ČNB rate valid on the DUZP (§4 odst. 8 ZDPH); older invoices carry their weekly-sheet label.
    const rateNote = inv.fxFixingDate
      ? `Kurz ČNB k DUZP / CNB rate at tax date: 1 ${inv.currency} = ${czRate(inv.fxRate)} CZK (fixing ${czDate(inv.fxFixingDate)})`
      : `Kurz / Exchange rate: 1 ${inv.currency} = ${czRate(inv.fxRate)} CZK${inv.fxWeek ? ` (${inv.fxWeek})` : ""}`;
    note(rateNote);
  }
  // Lines priced in another currency were converted at the ČNB rate (+ the company ROE %).
  if (inv.fxFixingDate && inv.lines.some((l) => l.unitCurrency !== inv.currency)) {
    const pct = Number(inv.roePct ?? 100);
    const buffer = pct !== 100 ? ` + ${String(Math.round((pct - 100) * 1000) / 1000).replace(".", ",")} %` : "";
    w.y -= 1;
    note(`Položky v jiné měně přepočteny kurzem ČNB k DUZP${buffer} / Items in other currencies converted at the CNB rate on the tax date${buffer}`);
  }
  const recapBottom = w.y;

  // totals box on the right, level with the recap
  let ty = recapTop;
  const totalRow = (label: string, value: string, strong = false) => {
    const size = strong ? 9.5 : 8.5;
    const font = strong ? bold : regular;
    w.text(label, tx, ty, size, { bold: strong, color: strong ? DARK : MUTED });
    // a value too wide to share the line with its label goes under it
    if (regular.widthOfTextAtSize(label, size) + 10 + font.widthOfTextAtSize(value, size) > right - tx) ty -= 12;
    w.text(value, right, ty, size, { bold: strong, align: "right" });
    ty -= 14;
  };
  totalRow("Celkem bez DPH / Net", `${czMoney(inv.net)} ${inv.currency}`);
  totalRow("DPH / VAT", `${czMoney(inv.vat)} ${inv.currency}`);
  ty -= 4;
  w.rect(tx - 8, ty - 26, right - tx + 8, 34, rgb(0.93, 0.94, 0.99));
  w.text(isCredit ? "K VRÁCENÍ / TO BE REFUNDED" : "K ÚHRADĚ / TOTAL DUE", tx, ty - 4, 8, { bold: true, color: MUTED });
  w.text(`${czMoney(isCredit ? -Number(inv.gross) : inv.gross)} ${inv.currency}`, right - 4, ty - 19, 14, { bold: true, align: "right" });
  ty -= 40;
  if (foreign) {
    totalRow("Celkem CZK / Total CZK", `${czMoney(inv.grossCzk)} CZK`);
    totalRow("DPH CZK / VAT CZK", `${czMoney(inv.vatCzk)} CZK`);
  }

  // QR Platba under the totals: account, amount, currency and variable symbol for banking apps
  const iban = bank?.iban || (bank?.accountNumber ? czIbanFromAccount(bank.accountNumber) ?? "" : "");
  const spd = isCredit
    ? null
    : spdPayment({ iban, swift: bank?.swift, amount: Number(inv.gross), currency: inv.currency, vs: variableSymbol(inv.shipment.jobNumber), message: inv.number });
  if (spd) {
    const qr = QRCode.create(spd, { errorCorrectionLevel: "M" });
    const size = 84;
    const cell = size / qr.modules.size;
    const qx = right - size;
    const qy = ty - 4; // top edge
    for (let r = 0; r < qr.modules.size; r++) {
      for (let c = 0; c < qr.modules.size; c++) {
        if (qr.modules.get(r, c)) w.page.drawRectangle({ x: qx + c * cell, y: qy - (r + 1) * cell, width: cell + 0.05, height: cell + 0.05, color: DARK });
      }
    }
    w.text("QR Platba", qx - 8, qy - 12, 8.5, { bold: true, align: "right" });
    w.text("Pay by QR in your banking app", qx - 8, qy - 24, 7.5, { color: MUTED, align: "right" });
    ty = qy - size - 6;
  }
  w.y = Math.min(recapBottom, ty) - 14;

  // ── Legal wording of the VAT codes used ──
  const texts = [...new Set(inv.vatSummary.map((v) => (isVatCode(v.vatCode) ? VAT_CODE_INFO[v.vatCode].legalText : "")).filter(Boolean))];
  for (const t of texts) {
    for (const l of w.wrap(t, 8, right - M)) {
      w.ensure(12);
      w.text(l, M, w.y, 8, { color: MUTED });
      w.y -= 11;
    }
  }
  if (inv.note) {
    w.y -= 4;
    for (const l of w.wrap(`Poznámka / Note: ${inv.note}`, 8.5, right - M)) {
      w.ensure(12);
      w.text(l, M, w.y, 8.5);
      w.y -= 11;
    }
  }

  // ── Footer on every page ──
  const contact = [s.email, s.phone, s.web].filter(Boolean).join("  ·  ");
  // at most three lines, kept clear of the page number on the right
  const footerMax = right - M - 80;
  const footer = [
    [s.companyName, s.ico && `IČO ${s.ico}`, s.dic && `DIČ ${s.dic}`].filter(Boolean).join("  ·  "),
    contact,
    s.footerNote,
  ]
    .filter(Boolean)
    .flatMap((f) => w.wrap(f, 7, footerMax))
    .slice(0, 3);
  w.pages.forEach((p, i) => {
    w.page = p;
    w.hline(M, right, M + 26);
    footer.forEach((f, j) => w.text(f, M, M + 15 - j * 9, 7, { color: MUTED }));
    w.text(`Strana / Page ${i + 1}/${w.pages.length}`, right, M + 15, 7, { color: MUTED, align: "right" });
  });

  return doc.save();
}
