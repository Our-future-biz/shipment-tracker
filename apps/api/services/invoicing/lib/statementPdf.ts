import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { czDate, docMoney, type PdfFonts } from "./invoicePdf";
import type { MailBank } from "./reminderTexts";
import type { Statement, StatementLanguage } from "./statement";

/**
 * A customer's statement as a PDF (Accounts Receivable step 7): one or more A4 pages in the customer's language
 * (Czech or English), the issuer's block from the invoice profile, the customer, the invoices still owed in one
 * currency with what is left to pay and the total, and the issuer's bank account for that currency. Drawn as
 * lib/invoicePdf draws an invoice (DejaVu Sans for the Czech letters, lib/pdfFonts).
 */

export interface StatementIssuer {
  companyName: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  ico: string;
  dic: string;
  registerEntry: string;
  email: string;
  phone: string;
  web: string;
  logoData: string;
  footerNote: string;
}

export interface StatementForPdf {
  statement: Statement;
  language: StatementLanguage;
  issuer: StatementIssuer;
  /** The customer's name and address lines (the billing address, else the seat), as the newest invoice names it */
  customer: { companyName: string; lines: string[] };
  /** The issuer's account in the statement's currency; null when the profile has none */
  bank: MailBank | null;
}

interface Texts {
  title: string;
  asAt: string;
  supplier: string;
  customer: string;
  cols: { number: string; job: string; issued: string; due: string; overdue: string; amount: string; credited: string; paid: string; writtenOff: string; left: string };
  amountsNote: (cur: string) => string;
  none: (cur: string) => string;
  total: string;
  overdueOfWhich: string;
  payment: string;
  bank: string;
  account: string;
  noAccount: string;
  reference: string;
  page: string;
  ico: string;
  dic: string;
}

/** The statement's words in Czech and English (the customer's language from the Customer Database). */
export const STATEMENT_TEXTS: Record<StatementLanguage, Texts> = {
  en: {
    title: "STATEMENT OF ACCOUNT",
    asAt: "as at",
    supplier: "SUPPLIER",
    customer: "CUSTOMER",
    cols: { number: "Invoice", job: "Job", issued: "Issued", due: "Due", overdue: "Days overdue", amount: "Amount", credited: "Credited", paid: "Paid", writtenOff: "Written off", left: "Left to pay" },
    amountsNote: (cur) => `Invoices not yet paid. Amounts with VAT, in ${cur}.`,
    none: (cur) => `No invoice in ${cur} is left to pay.`,
    total: "TOTAL LEFT TO PAY",
    overdueOfWhich: "of which overdue",
    payment: "Payment details",
    bank: "Bank",
    account: "Account no.",
    noAccount: "Please pay to the account stated on each invoice.",
    reference: "Payment reference: the job number's digits as on each invoice.",
    page: "Page",
    ico: "Reg. no.",
    dic: "VAT no.",
  },
  cs: {
    title: "VÝPIS OTEVŘENÝCH POLOŽEK",
    asAt: "ke dni",
    supplier: "DODAVATEL",
    customer: "ODBĚRATEL",
    cols: { number: "Faktura", job: "Zakázka", issued: "Vystaveno", due: "Splatnost", overdue: "Dní po spl.", amount: "Částka", credited: "Dobropis", paid: "Zaplaceno", writtenOff: "Odepsáno", left: "Zbývá" },
    amountsNote: (cur) => `Neuhrazené faktury. Částky včetně DPH, v ${cur}.`,
    none: (cur) => `Žádná faktura v ${cur} nezbývá k úhradě.`,
    total: "CELKEM K ÚHRADĚ",
    overdueOfWhich: "z toho po splatnosti",
    payment: "Platební údaje",
    bank: "Banka",
    account: "Číslo účtu",
    noAccount: "Prosíme o úhradu na účet uvedený na každé faktuře.",
    reference: "Variabilní symbol: číslice čísla zakázky, jak je uveden na každé faktuře.",
    page: "Strana",
    ico: "IČO",
    dic: "DIČ",
  },
};

const DARK = rgb(0.11, 0.13, 0.2);
const MUTED = rgb(0.4, 0.43, 0.5);
const LINE = rgb(0.85, 0.87, 0.9);
const ZEBRA = rgb(0.965, 0.97, 0.98);
const ACCENT = rgb(0.25, 0.3, 0.75);
const HEAD = rgb(0.93, 0.94, 0.99);

const A4 = { w: 595.28, h: 841.89 };
const M = 40;

class Writer {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;

  constructor(
    private doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.pages.push(this.page);
    this.y = A4.h - M;
  }

  font = (bold?: boolean) => (bold ? this.bold : this.regular);

  text(t: string, x: number, y: number, size: number, opts: { bold?: boolean; color?: ReturnType<typeof rgb>; align?: "left" | "right" } = {}) {
    const font = this.font(opts.bold);
    // The no-break spaces of a figure are drawn as plain ones (as lib/invoicePdf does).
    const clean = t.replace(/[  ]/g, " ");
    const width = font.widthOfTextAtSize(clean, size);
    this.page.drawText(clean, { x: opts.align === "right" ? x - width : x, y, size, font, color: opts.color ?? DARK });
  }

  /** Text kept within `max` points: smaller down to 6 pt, then cut. */
  fit(t: string, x: number, y: number, size: number, max: number, opts: { bold?: boolean; color?: ReturnType<typeof rgb>; align?: "left" | "right" } = {}) {
    const font = this.font(opts.bold);
    let s = size;
    while (s > 6 && font.widthOfTextAtSize(t, s) > max) s -= 0.5;
    let shown = t;
    while (shown.length > 1 && font.widthOfTextAtSize(shown, s) > max) shown = shown.slice(0, -1);
    this.text(shown, x, y, s, opts);
  }

  wrap(t: string, size: number, maxWidth: number, bold = false): string[] {
    const font = this.font(bold);
    const out: string[] = [];
    for (const para of t.split(/\r?\n/)) {
      let line = "";
      for (const word of para.split(/[^\S ]+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
        else {
          if (line) out.push(line);
          line = word;
        }
      }
      if (line) out.push(line);
    }
    return out.length ? out : [""];
  }

  hline(x1: number, x2: number, y: number, color = LINE, thickness = 0.6) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
  }

  rect(x: number, y: number, w: number, h: number, color: ReturnType<typeof rgb>) {
    this.page.drawRectangle({ x, y, width: w, height: h, color });
  }
}

async function embedLogo(doc: PDFDocument, dataUrl: string): Promise<PDFImage | null> {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  try {
    const bytes = Buffer.from(m[2]!, "base64");
    return m[1] === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null; // a broken logo never stops the statement
  }
}

function issuerLines(s: StatementIssuer, t: Texts): string[] {
  const lines: string[] = [];
  if (s.street) lines.push(s.street);
  const city = [s.postalCode, s.city].filter(Boolean).join(" ");
  if (city) lines.push(city);
  if (s.country && s.country !== "CZ") lines.push(s.country);
  if (s.ico) lines.push(`${t.ico}: ${s.ico}`);
  if (s.dic) lines.push(`${t.dic}: ${s.dic}`);
  const contact = [s.email, s.phone].filter(Boolean).join(" · ");
  if (contact) lines.push(contact);
  return lines;
}

export async function renderStatementPdf(input: StatementForPdf, fonts: PdfFonts): Promise<Uint8Array> {
  const t = STATEMENT_TEXTS[input.language];
  const s = input.statement;
  const cur = s.currency;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  doc.setTitle(`${t.title} ${input.customer.companyName} ${cur} ${czDate(s.asAt)}`);
  doc.setAuthor(input.issuer.companyName);
  doc.setCreator("Shipment Tracker");
  doc.setCreationDate(new Date(`${s.asAt}T00:00:00Z`));
  doc.setModificationDate(new Date(`${s.asAt}T00:00:00Z`));

  const w = new Writer(doc, regular, bold);
  const right = A4.w - M;

  // ── Header: logo or name, the title, the day ──
  const title = t.title;
  const sub = `${t.asAt} ${czDate(s.asAt)} · ${cur}`;
  const titleW = Math.max(bold.widthOfTextAtSize(title, 13), regular.widthOfTextAtSize(sub, 9));
  const nameMax = right - M - titleW - 24;
  let headerH = 44;
  const logo = await embedLogo(doc, input.issuer.logoData);
  if (logo) {
    const scale = Math.min(150 / logo.width, 40 / logo.height, nameMax / logo.width, 1);
    w.page.drawImage(logo, { x: M, y: w.y - logo.height * scale, width: logo.width * scale, height: logo.height * scale });
  } else {
    const lines = w.wrap(input.issuer.companyName, 13, nameMax, true).slice(0, 2);
    lines.forEach((l, i) => w.text(l, M, w.y - 15 - i * 16, 13, { bold: true }));
    headerH = Math.max(headerH, 15 + (lines.length - 1) * 16 + 14);
  }
  w.text(title, right, w.y - 13, 13, { bold: true, align: "right" });
  w.text(sub, right, w.y - 28, 9, { color: MUTED, align: "right" });
  w.y -= headerH;
  w.hline(M, right, w.y, ACCENT, 1.2);
  w.y -= 16;

  // ── Parties ──
  const colW = (right - M - 16) / 2;
  const partyTop = w.y;
  const drawParty = (x: number, label: string, lines: string[], border: ReturnType<typeof rgb>) => {
    w.text(label, x + 10, partyTop - 14, 7.5, { bold: true, color: MUTED });
    let y = partyTop - 30;
    lines.forEach((l, i) => {
      for (const part of w.wrap(l, i === 0 ? 10 : 8.5, colW - 20, i === 0)) {
        w.text(part, x + 10, y, i === 0 ? 10 : 8.5, { bold: i === 0 });
        y -= i === 0 ? 14 : 11.5;
      }
    });
    return { h: partyTop - y, border };
  };
  const a = drawParty(M, t.supplier, [input.issuer.companyName, ...issuerLines(input.issuer, t)], LINE);
  const b = drawParty(M + colW + 16, t.customer, [input.customer.companyName, ...input.customer.lines], ACCENT);
  const boxH = Math.max(a.h, b.h) + 4;
  w.page.drawRectangle({ x: M, y: partyTop - boxH, width: colW, height: boxH, borderColor: a.border, borderWidth: 0.8 });
  w.page.drawRectangle({ x: M + colW + 16, y: partyTop - boxH, width: colW, height: boxH, borderColor: b.border, borderWidth: 0.8 });
  w.y = partyTop - boxH - 18;

  w.text(t.amountsNote(cur), M, w.y, 8.5, { color: MUTED });
  w.y -= 10;

  // ── The invoices ──
  // Left edges of the text columns with their widths, right edges of the figures (DejaVu is wide: an amount of
  // millions with its group spaces takes about 55 pt at 7.5 pt).
  // Amount − Credited − Paid − Written off = Left to pay on every line (write-offs and bank charges together).
  const c = { number: M + 3, job: M + 90, issued: M + 136, due: M + 180, overdue: M + 250, amount: M + 302, credited: M + 354, paid: M + 406, writtenOff: M + 458, left: right - 3 };
  const width = { number: 84, job: 44, issued: 42, due: 42, overdue: 26, amount: 50, credited: 50, paid: 50, writtenOff: 50, left: 52 };
  const SIZE = 7.5;
  const HEADER_H = 24;
  const header = () => {
    w.rect(M, w.y - HEADER_H, right - M, HEADER_H, HEAD);
    const o = { bold: true, color: MUTED } as const;
    // A heading too long for its column takes a second line.
    const head = (label: string, x: number, max: number, align: "left" | "right") => {
      const lines = w.wrap(label, 7, max, true).slice(0, 2);
      const top = lines.length > 1 ? w.y - 10 : w.y - 15;
      lines.forEach((l, i) => w.fit(l, x, top - i * 8.5, 7, max, { ...o, align }));
    };
    head(t.cols.number, c.number, width.number, "left");
    head(t.cols.job, c.job, width.job, "left");
    head(t.cols.issued, c.issued, width.issued, "left");
    head(t.cols.due, c.due, width.due, "left");
    head(t.cols.overdue, c.overdue, width.overdue, "right");
    head(t.cols.amount, c.amount, width.amount, "right");
    head(t.cols.credited, c.credited, width.credited, "right");
    head(t.cols.paid, c.paid, width.paid, "right");
    head(t.cols.writtenOff, c.writtenOff, width.writtenOff, "right");
    head(t.cols.left, c.left, width.left, "right");
    w.y -= HEADER_H;
  };
  header();
  if (!s.lines.length) {
    w.y -= 16;
    w.text(t.none(cur), M + 4, w.y, 9);
    w.y -= 8;
  }
  const ROW = 15;
  s.lines.forEach((l, i) => {
    if (w.y - ROW < M + 50) {
      w.newPage();
      header();
    }
    if (i % 2 === 1) w.rect(M, w.y - ROW, right - M, ROW, ZEBRA);
    const y = w.y - 10.5;
    w.fit(l.number, c.number, y, SIZE, width.number);
    w.fit(l.jobNumber, c.job, y, SIZE, width.job);
    w.fit(czDate(l.issueDate), c.issued, y, SIZE, width.issued);
    w.fit(czDate(l.dueDate), c.due, y, SIZE, width.due);
    w.fit(l.daysOverdue > 0 ? String(l.daysOverdue) : "–", c.overdue, y, SIZE, width.overdue, { align: "right", bold: l.daysOverdue > 0 });
    w.fit(docMoney(l.amount), c.amount, y, SIZE, width.amount, { align: "right" });
    w.fit(l.credited ? docMoney(l.credited) : "–", c.credited, y, SIZE, width.credited, { align: "right" });
    w.fit(l.paid ? docMoney(l.paid) : "–", c.paid, y, SIZE, width.paid, { align: "right" });
    w.fit(l.writtenOff ? docMoney(l.writtenOff) : "–", c.writtenOff, y, SIZE, width.writtenOff, { align: "right" });
    w.fit(docMoney(l.leftToPay), c.left, y, SIZE, width.left, { align: "right", bold: true });
    w.y -= ROW;
  });
  w.hline(M, right, w.y);
  w.y -= 14;

  // ── Total ──
  const bank = input.bank;
  const bankRows: [string, string][] = [];
  if (bank?.bankName) bankRows.push([t.bank, bank.bankName]);
  if (bank?.accountNumber) bankRows.push([t.account, bank.accountNumber]);
  if (bank?.iban) bankRows.push(["IBAN", bank.iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim()]);
  if (bank?.swift) bankRows.push(["SWIFT / BIC", bank.swift]);
  const needed = 60 + Math.max(bankRows.length, 1) * 13 + 30;
  if (w.y - needed < M + 40) w.newPage();
  const tx = M + colW + 16;
  const totalTop = w.y;
  w.rect(tx - 8, w.y - 30, right - tx + 8, 36, HEAD);
  w.text(t.total, tx, w.y - 6, 8, { bold: true, color: MUTED });
  w.text(`${docMoney(s.totals.leftToPay)} ${cur}`, right - 4, w.y - 22, 14, { bold: true, align: "right" });
  let ty = w.y - 44;
  if (s.totals.overdue > 0) {
    w.text(t.overdueOfWhich, tx, ty, 8.5, { color: MUTED });
    w.text(`${docMoney(s.totals.overdue)} ${cur}`, right - 4, ty, 8.5, { bold: true, align: "right" });
    ty -= 14;
  }

  // ── Payment details, left of the total ──
  let py = totalTop;
  w.text(t.payment, M, py - 6, 8, { bold: true, color: MUTED });
  py -= 20;
  if (!bankRows.length) {
    for (const l of w.wrap(t.noAccount, 8.5, colW - 4)) {
      w.text(l, M, py, 8.5);
      py -= 12;
    }
  }
  for (const [k, v] of bankRows) {
    w.text(k, M, py, 7.5, { color: MUTED });
    w.fit(v, M + 70, py, 8.5, colW - 74, { bold: true });
    py -= 13;
  }
  py -= 3;
  for (const l of w.wrap(t.reference, 8, colW - 4)) {
    w.text(l, M, py, 8, { color: MUTED });
    py -= 11;
  }
  w.y = Math.min(py, ty) - 10;

  if (input.issuer.registerEntry) {
    for (const l of w.wrap(input.issuer.registerEntry, 7.5, right - M)) {
      if (w.y < M + 40) w.newPage();
      w.text(l, M, w.y, 7.5, { color: MUTED });
      w.y -= 10;
    }
  }

  // ── Footer on every page ──
  const iss = input.issuer;
  const footer = [
    [iss.companyName, iss.ico && `${t.ico} ${iss.ico}`, iss.dic && `${t.dic} ${iss.dic}`].filter(Boolean).join("  ·  "),
    [iss.email, iss.phone, iss.web].filter(Boolean).join("  ·  "),
    iss.footerNote,
  ]
    .filter(Boolean)
    .flatMap((f) => w.wrap(f, 7, right - M - 80))
    .slice(0, 3);
  w.pages.forEach((p, i) => {
    w.page = p;
    w.hline(M, right, M + 26);
    footer.forEach((f, j) => w.text(f, M, M + 15 - j * 9, 7, { color: MUTED }));
    w.text(`${t.page} ${i + 1}/${w.pages.length}`, right, M + 15, 7, { color: MUTED, align: "right" });
  });

  return doc.save();
}
