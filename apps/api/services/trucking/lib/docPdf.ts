import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { DocLanguage, DocLoad, DocParty, DocStop, TransportOrderDoc } from "./documentTypes";
import { formatDate, formatMoney, formatNumber, formatQuantity, partyLines, stopAddressLines, wrapText, type LabelKey } from "./docFormat";

/**
 * The small page writer the trucking documents share: A4 pages (or another size, e.g. A4
 * landscape or a label), DejaVu Sans (covers Czech diacritics, which the built-in PDF fonts cannot
 * print), wrapping, page breaks and the footer with page numbers. Same look as the invoice PDF
 * (services/invoicing/lib/invoicePdf.ts). Below the writer: the blocks the transport orders share.
 */

export const DARK = rgb(0.11, 0.13, 0.2);
export const MUTED = rgb(0.4, 0.43, 0.5);
export const LINE = rgb(0.85, 0.87, 0.9);
export const TINT = rgb(0.93, 0.94, 0.99);
export const ACCENT = rgb(0.25, 0.3, 0.75);
export const WARN = rgb(0.75, 0.2, 0.12);
export const WARN_TINT = rgb(0.99, 0.94, 0.92);

export interface PageSize {
  w: number;
  h: number;
}

export const A4: PageSize = { w: 595.28, h: 841.89 };
export const A4_LANDSCAPE: PageSize = { w: A4.h, h: A4.w };
export const M = 40; // page margin
export const RIGHT = A4.w - M;
/** Lowest y the content may reach; below it sit the footer and the margin. */
export const BOTTOM = M + 40;

let fontBytes: Promise<{ regular: Uint8Array; bold: Uint8Array }> | null = null;

/** DejaVu Sans regular and bold from the dejavu-fonts-ttf package; read once, then cached. */
function loadFonts() {
  if (!fontBytes) {
    const require = createRequire(import.meta.url);
    const path = (file: string) => require.resolve(`dejavu-fonts-ttf/ttf/${file}`);
    fontBytes = Promise.all([readFile(path("DejaVuSans.ttf")), readFile(path("DejaVuSans-Bold.ttf"))])
      .then(([regular, bold]) => ({ regular: new Uint8Array(regular), bold: new Uint8Array(bold) }))
      .catch((err) => {
        fontBytes = null; // try again next time instead of caching the failure
        throw err;
      });
  }
  return fontBytes;
}

interface TextOpts {
  bold?: boolean;
  color?: RGB;
  align?: "left" | "right" | "center";
}

export class Writer {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;

  private constructor(
    readonly doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    readonly size: PageSize,
  ) {
    this.newPage();
  }

  /** A new document with its metadata set; dated `issuedAt` so the same data gives the same bytes. */
  static async create(meta: { title: string; author: string; issuedAt: string }, size: PageSize = A4): Promise<Writer> {
    const fonts = await loadFonts();
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const regular = await doc.embedFont(fonts.regular, { subset: true });
    const bold = await doc.embedFont(fonts.bold, { subset: true });
    doc.setTitle(meta.title);
    doc.setAuthor(meta.author);
    doc.setCreator("Shipment Tracker");
    const issued = new Date(meta.issuedAt);
    if (!Number.isNaN(issued.getTime())) {
      doc.setCreationDate(issued);
      doc.setModificationDate(issued);
    }
    return new Writer(doc, regular, bold, size);
  }

  newPage() {
    this.page = this.doc.addPage([this.size.w, this.size.h]);
    this.pages.push(this.page);
    this.y = this.size.h - M;
  }

  /** Right edge of the content: the page width less the margin. */
  get right(): number {
    return this.size.w - M;
  }

  /** Points left above the footer on the current page. */
  get room(): number {
    return this.y - BOTTOM;
  }

  /** Starts a new page when fewer than `needed` points are left above the footer. */
  ensure(needed: number): boolean {
    if (this.room >= needed) return false;
    this.newPage();
    return true;
  }

  width(t: string, size: number, bold = false): number {
    return (bold ? this.bold : this.regular).widthOfTextAtSize(clean(t), size);
  }

  text(t: string, x: number, y: number, size: number, opts: TextOpts = {}) {
    const font = opts.bold ? this.bold : this.regular;
    const s = clean(t);
    const w = font.widthOfTextAtSize(s, size);
    const left = opts.align === "right" ? x - w : opts.align === "center" ? x - w / 2 : x;
    this.page.drawText(s, { x: left, y, size, font, color: opts.color ?? DARK });
  }

  wrap(t: string, size: number, maxWidth: number, bold = false): string[] {
    return wrapText(clean(t), maxWidth, (s) => this.width(s, size, bold));
  }

  hline(x1: number, x2: number, y: number, color: RGB = LINE, thickness = 0.6) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
  }

  /** Rectangle with its top-left corner at (x, top). */
  box(x: number, top: number, w: number, h: number, opts: { fill?: RGB; border?: RGB; borderWidth?: number } = {}) {
    this.page.drawRectangle({
      x,
      y: top - h,
      width: w,
      height: h,
      color: opts.fill,
      borderColor: opts.border,
      borderWidth: opts.border ? (opts.borderWidth ?? 0.8) : 0,
    });
  }

  /** Footer lines and "1 / 2" page numbers on every page. */
  finish(footer: string[]): Promise<Uint8Array> {
    const total = this.pages.length;
    this.pages.forEach((p, i) => {
      this.page = p;
      this.hline(M, this.right, M + 26);
      footer.forEach((f, j) => this.text(f, M, M + 15 - j * 9, 7, { color: MUTED }));
      this.text(`${i + 1} / ${total}`, this.right, M + 15, 8, { color: MUTED, align: "right" });
    });
    return this.doc.save();
  }
}

/** No-break and narrow no-break spaces as plain spaces, tabs as spaces. */
function clean(t: string): string {
  return t.replace(/[  \t]/g, " ");
}

// ── Blocks the transport orders share (A4 portrait) ──

const FULL = RIGHT - M;
const LABEL_W = 132; // label column of the field rows
const VALUE_X = M + 8 + LABEL_W + 10;
const VALUE_W = RIGHT - 8 - VALUE_X;
const SIGNATURE_COL_W = (FULL - 40) / 2;

type Labeler = (key: LabelKey) => string;

export interface Row {
  label: string;
  value: string;
  bold?: boolean;
  color?: RGB;
}

/** Our company left; the document title, its number and a dated line right; an accent rule under. */
export function drawDocHeader(w: Writer, company: DocParty, title: { main: string; sub: string }, number: string, dateLine: string) {
  const top = w.y;
  const halfW = (w.right - M) / 2 - 10;
  let ly = top - 16;
  for (const l of w.wrap(company.name, 14, halfW, true)) {
    w.text(l, M, ly, 14, { bold: true });
    ly -= 17;
  }
  const address = [company.street, [company.postcode, company.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  for (const l of w.wrap(address, 8.5, halfW)) {
    w.text(l, M, ly, 8.5, { color: MUTED });
    ly -= 11;
  }
  w.text(title.main.toUpperCase(), w.right, top - 12, 13, { bold: true, align: "right" });
  if (title.sub) w.text(title.sub, w.right, top - 26, 9, { color: MUTED, align: "right" });
  w.text(number, w.right, top - 44, 15, { bold: true, color: ACCENT, align: "right" });
  w.text(dateLine, w.right, top - 58, 8.5, { color: MUTED, align: "right" });
  w.y = Math.min(top - 66, ly - 4);
  w.hline(M, w.right, w.y, ACCENT, 1.2);
  w.y -= 16;
}

/** Two party boxes side by side, like the invoice's supplier and customer. */
export function drawParties(w: Writer, left: [string, DocParty], right: [string, DocParty], lang: DocLanguage) {
  const colW = (FULL - 16) / 2;
  const layout = ([title, party]: [string, DocParty]) =>
    partyLines(party, lang).map((line, i) => ({ lines: w.wrap(line, i === 0 ? 10.5 : 8.5, colW - 20, i === 0), first: i === 0, title }));
  const blocks = [layout(left), layout(right)];
  const heights = blocks.map((b) => 30 + b.reduce((h, part) => h + part.lines.length * (part.first ? 14 : 11.5), 0));
  const boxH = Math.max(...heights) + 4;
  w.ensure(boxH);
  const top = w.y;
  blocks.forEach((block, col) => {
    const x = M + col * (colW + 16);
    w.box(x, top, colW, boxH, { border: col === 0 ? LINE : ACCENT });
    w.text(block[0]?.title.toUpperCase() ?? "", x + 10, top - 14, 7.5, { bold: true, color: MUTED });
    let y = top - 30;
    for (const part of block) {
      for (const l of part.lines) {
        w.text(l, x + 10, y, part.first ? 10.5 : 8.5, { bold: part.first });
        y -= part.first ? 14 : 11.5;
      }
    }
  });
  w.y = top - boxH - 12;
}

/** A tinted strip of equal cells across the content width: small label above, bold value below (values wrap). */
export function drawCells(w: Writer, items: [string, string][], opts: { fill?: RGB; border?: RGB; valueColor?: RGB } = {}) {
  const full = w.right - M;
  const cellW = full / items.length;
  const laid = items.map(([k, v]) => ({ k: w.wrap(k, 7, cellW - 16), v: w.wrap(v || "—", 10, cellW - 16, true) }));
  const h = Math.max(...laid.map((c) => 14 + c.k.length * 9 + c.v.length * 13)) + 2;
  w.ensure(h);
  const top = w.y;
  w.box(M, top, full, h, { fill: opts.fill ?? TINT, border: opts.border });
  laid.forEach((c, i) => {
    const x = M + i * cellW + 8;
    let y = top - 11;
    for (const l of c.k) {
      w.text(l, x, y, 7, { color: MUTED });
      y -= 9;
    }
    y -= 4;
    for (const l of c.v) {
      w.text(l, x, y, 10, { bold: true, color: opts.valueColor ?? DARK });
      y -= 13;
    }
  });
  w.y = top - h - 12;
}

export function drawPin(w: Writer, title: string, hint: string, pin: string) {
  const pinSize = 24;
  const pinW = w.width(pin, pinSize, true);
  const hintLines = w.wrap(hint, 8, FULL - pinW - 48);
  const h = Math.max(48, 30 + hintLines.length * 10);
  w.ensure(h);
  const top = w.y;
  w.box(M, top, FULL, h, { fill: TINT, border: ACCENT, borderWidth: 1.5 });
  w.text(title.toUpperCase(), M + 12, top - 16, 9, { bold: true, color: ACCENT });
  hintLines.forEach((l, i) => w.text(l, M + 12, top - 30 - i * 10, 8, { color: MUTED }));
  w.text(pin, RIGHT - 14, top - h / 2 - pinSize / 3, pinSize, { bold: true, color: ACCENT, align: "right" });
  w.y = top - h - 12;
}

/** The PIN box without a PIN: only the note where the PIN comes from. */
export function drawPinNote(w: Writer, title: string, note: string) {
  const lines = w.wrap(note, 9, FULL - 24);
  const h = 26 + lines.length * 11;
  w.ensure(h);
  const top = w.y;
  w.box(M, top, FULL, h, { fill: TINT, border: ACCENT, borderWidth: 1.5 });
  w.text(title.toUpperCase(), M + 12, top - 16, 9, { bold: true, color: ACCENT });
  lines.forEach((l, i) => w.text(l, M + 12, top - 30 - i * 11, 9, { color: DARK }));
  w.y = top - h - 12;
}

/** A tinted section title bar across the content width; starts a new page first when the bar and `next` points do not fit. */
export function sectionTitle(w: Writer, title: string, next: number) {
  w.ensure(22 + next);
  w.box(M, w.y, w.right - M, 20, { fill: TINT });
  w.text(title.toUpperCase(), M + 8, w.y - 13.5, 8, { bold: true, color: MUTED });
  w.y -= 24;
}

/** A section of label / value rows under a title bar. */
export function drawRows(w: Writer, title: string, rows: Row[], L: Labeler) {
  const laid = layRows(w, rows);
  sectionTitle(w, title, Math.min(laid[0]?.h ?? 0, 200));
  fieldRows(w, laid, `${title} (${L("continued")})`);
  w.y -= 12;
}

function layRows(w: Writer, rows: Row[]) {
  return rows.map((r) => {
    const labels = w.wrap(r.label, 7.5, LABEL_W);
    const values = w.wrap(r.value, 9, VALUE_W, r.bold);
    return { r, labels, values, h: Math.max(labels.length * 10, values.length * 12) + 6 };
  });
}

/**
 * Label / value rows; values wrap. A row that does not fit goes to the next page under a
 * "continued" title; a row taller than a whole page breaks line by line.
 */
function fieldRows(w: Writer, laid: ReturnType<typeof layRows>, continuedTitle: string) {
  for (const { r, labels, values, h } of laid) {
    if (h > w.room && w.room < 200) {
      w.newPage();
      sectionTitle(w, continuedTitle, 0);
    }
    drawRow(w, r, labels, values);
  }
}

/** One label / value row; a value taller than the page continues line by line on the next one. */
function drawRow(w: Writer, r: Row, labels: string[], values: string[]) {
  labels.forEach((l, i) => w.text(l, M + 8, w.y - 10 - i * 10, 7.5, { color: MUTED }));
  let y = w.y;
  for (const v of values) {
    if (y - 12 < BOTTOM) {
      w.newPage();
      y = w.y;
    }
    w.text(v, VALUE_X, y - 10, 9, { bold: r.bold, color: r.color ?? DARK });
    y -= 12;
  }
  w.y = Math.min(y, w.y - labels.length * 10) - 6;
  w.hline(M + 8, RIGHT - 8, w.y + 3);
}

export function stopRows(s: DocStop, L: Labeler): Row[] {
  const rows: Row[] = [{ label: L("address"), value: stopAddressLines(s).join("\n") || "—", bold: true }];
  if (s.windowText) rows.push({ label: L("timeWindow"), value: s.windowText, bold: true });
  if (s.contact) rows.push({ label: L("contact"), value: s.contact });
  if (s.reference) rows.push({ label: L("reference"), value: s.reference });
  if (s.avizaceRequired) rows.push({ label: L("avizace"), value: L("avizaceRequired"), bold: true, color: WARN });
  if (s.notes) rows.push({ label: L("notes"), value: s.notes });
  return rows;
}

/** The load section: the quantity cells, then the description, handling and ADR. */
export function drawLoad(w: Writer, load: DocLoad, L: Labeler, lang: DocLanguage) {
  sectionTitle(w, L("load"), 50);
  drawCells(w, [
    [L("pieces"), formatNumber(load.pieces, lang, 0)],
    [L("palletPlaces"), formatNumber(load.palletPlaces, lang)],
    [L("ldm"), formatNumber(load.ldm, lang)],
    [L("weight"), formatQuantity(load.weightKg, "kg", lang, 1)],
    [L("volume"), formatQuantity(load.cbm, "m³", lang, 3)],
  ], { fill: TINT });
  w.y += 6;
  drawLoadDetails(w, load, L);
}

/** Description, handling (non-stackable, tail lift) and the ADR cells of a load. */
export function drawLoadDetails(w: Writer, load: DocLoad, L: Labeler) {
  const rows: Row[] = [{ label: L("description"), value: load.description || "—" }];
  const handling = [load.nonStackable && L("nonStackable"), load.tailLift && L("tailLift")].filter(Boolean).join("  ·  ");
  if (handling) rows.push({ label: L("handling"), value: handling, bold: true, color: WARN });
  fieldRows(w, layRows(w, rows), `${L("load")} (${L("continued")})`);
  w.y -= 8;
  if (load.adr) {
    const un = /^UN/i.test(load.adr.un) ? load.adr.un : `UN ${load.adr.un}`;
    w.ensure(70);
    w.text(L("adrTitle").toUpperCase(), M + 2, w.y - 10, 9, { bold: true, color: WARN });
    w.y -= 16;
    drawCells(w, [
      [L("unNumber"), un],
      [L("adrClass"), load.adr.className],
      [L("packingGroup"), load.adr.packingGroup || "—"],
    ], { fill: WARN_TINT, border: WARN, valueColor: WARN });
  } else {
    w.y -= 6;
  }
}

/**
 * The end of a transport order: vehicle and driver, price and payment (when agreed), the POD
 * link, the numbered terms (the last two kept on the page of the signatures) and the signatures.
 */
export function drawOrderEnd(w: Writer, doc: TransportOrderDoc, L: Labeler) {
  const lang = doc.language;

  // ── Vehicle and driver ──
  drawRows(w, L("vehicle"), [
    { label: L("vehicleType"), value: doc.vehicleText || "—" },
    { label: L("plates"), value: doc.plates || "—", bold: Boolean(doc.plates) },
    { label: L("driver"), value: doc.driver || "—" },
  ], L);

  // ── Price and payment (left out when no price is agreed) ──
  if (doc.agreedPrice) {
    const rows: Row[] = [{ label: L("agreedPrice"), value: formatMoney(doc.agreedPrice.total, doc.agreedPrice.currency, lang), bold: true }];
    if (doc.agreedPrice.note) rows.push({ label: L("priceNote"), value: doc.agreedPrice.note });
    if (doc.paymentTerms) rows.push({ label: L("paymentTerms"), value: doc.paymentTerms });
    drawRows(w, L("price"), rows, L);
  }

  // ── Confirmation and POD upload link ──
  if (doc.podLink) {
    sectionTitle(w, L("pod"), 30);
    for (const l of w.wrap(L("podHint"), 8.5, FULL - 16)) {
      w.ensure(12);
      w.text(l, M + 8, w.y - 10, 8.5);
      w.y -= 12;
    }
    for (const l of w.wrap(doc.podLink, 9.5, FULL - 16, true)) {
      w.ensure(13);
      w.text(l, M + 8, w.y - 11, 9.5, { bold: true, color: ACCENT });
      w.y -= 13;
    }
    w.y -= 14;
  }

  // ── Numbered terms; the last two stay on the page of the signatures ──
  const signatures = layoutSignatures(w, [L("forForwarder"), doc.ourCompany.name], [L("forHaulier"), doc.haulier.name]);
  if (doc.terms.length) {
    const terms = doc.terms.map((term) => w.wrap(term, 8, FULL - 34));
    const keepFrom = Math.max(0, terms.length - 2);
    const keepNeed = terms.slice(keepFrom).reduce((h, lines) => h + lines.length * 11 + 3, 0) + 12 + signatures.height;
    sectionTitle(w, L("terms"), keepFrom === 0 ? keepNeed : 24);
    terms.forEach((lines, i) => {
      if (i === keepFrom && i > 0 && w.room < keepNeed) {
        w.newPage();
        sectionTitle(w, `${L("terms")} (${L("continued")})`, 0);
      }
      w.text(`${i + 1}.`, M + 8, w.y - 10, 8, { bold: true, color: MUTED });
      for (const l of lines) {
        if (w.ensure(11)) w.y -= 4;
        w.text(l, M + 26, w.y - 10, 8);
        w.y -= 11;
      }
      w.y -= 3;
    });
    w.y -= 12;
  }

  // ── Signatures ──
  drawSignatures(w, signatures, L);
}

/** The footer lines of a transport order: our company with its IDs, then the title and number. */
export function orderFooter(doc: TransportOrderDoc, titleMain: string, L: Labeler): string[] {
  const c = doc.ourCompany;
  return [[c.name, c.ico && `${L("ico")} ${c.ico}`, c.dic && `${L("dic")} ${c.dic}`].filter(Boolean).join("  ·  "), `${titleMain} ${doc.orderNumber}`];
}

/** "Issued: 15. 10. 2026" */
export const issuedLine = (doc: TransportOrderDoc, L: Labeler) => `${L("issued")}: ${formatDate(doc.issuedAt, doc.language)}`;

/** The two signature blocks wrapped, with the height they need. */
function layoutSignatures(w: Writer, left: [string, string], right: [string, string]) {
  const colW = SIGNATURE_COL_W;
  const blocks = [left, right].map(([title, name]) => ({ title: w.wrap(title.toUpperCase(), 7.5, colW, true), name: w.wrap(name, 9, colW, true) }));
  const head = Math.max(...blocks.map((b) => b.title.length * 10 + b.name.length * 12));
  return { blocks, head, height: head + 80 };
}

function drawSignatures(w: Writer, { blocks, head, height }: ReturnType<typeof layoutSignatures>, L: Labeler) {
  const colW = SIGNATURE_COL_W;
  w.ensure(height);
  const top = w.y;
  blocks.forEach((b, i) => {
    const x = M + i * (colW + 40);
    let y = top - 10;
    for (const l of b.title) {
      w.text(l, x, y, 7.5, { bold: true, color: MUTED });
      y -= 10;
    }
    for (const l of b.name) {
      w.text(l, x, y, 9, { bold: true });
      y -= 12;
    }
    const lineY = top - head - 52;
    w.hline(x, x + colW, lineY, MUTED, 0.6);
    w.text(L("signatureStamp"), x, lineY - 11, 7.5, { color: MUTED });
    w.text(`${L("date")}:`, x, lineY - 23, 7.5, { color: MUTED });
  });
  w.y = top - height;
}

// ── Tables (manifest rows, stops of a transport order) ──

export interface TableColumn {
  title: string;
  width: number;
  align?: "left" | "right";
}

export interface TableCell {
  text: string;
  bold?: boolean;
  /** Only the first line (up to the first line break) in bold, e.g. a place's name above its address. */
  boldFirst?: boolean;
  color?: RGB;
}

const CELL_PAD = 4;

/**
 * A table across the content width: a tinted header row, rows whose cells wrap, and an optional
 * tinted bold totals row. A row that does not fit goes to the next page, under a "continued"
 * title bar and the header row again. The totals row, and `keepAfter` points of what follows the
 * table (e.g. signatures), stay on the page of the last row.
 */
export function drawTable(
  w: Writer,
  columns: TableColumn[],
  rows: (string | TableCell)[][],
  opts: { continuedTitle: string; size?: number; totals?: (string | TableCell)[]; keepAfter?: number },
) {
  const size = opts.size ?? 7.5;
  const lineH = size + 2;
  const layRow = (cells: (string | TableCell)[], bold = false) => {
    const laid = columns.map((col, i) => {
      const raw = cells[i] ?? "";
      const cell: TableCell = typeof raw === "string" ? { text: raw } : raw;
      const isBold = bold || Boolean(cell.bold);
      const width = col.width - 2 * CELL_PAD;
      if (cell.boldFirst && !isBold) {
        const [first = "", ...rest] = cell.text.split("\n");
        const head = w.wrap(first, size, width, true).map((text) => ({ text, bold: true }));
        const tail = rest.length ? w.wrap(rest.join("\n"), size, width).map((text) => ({ text, bold: false })) : [];
        return { cell, lines: [...head, ...tail] };
      }
      return { cell, lines: w.wrap(cell.text, size, width, isBold).map((text) => ({ text, bold: isBold })) };
    });
    return { laid, h: Math.max(...laid.map((c) => c.lines.length)) * lineH + 6 };
  };
  const header = columns.map((col) => w.wrap(col.title, size - 0.5, col.width - 2 * CELL_PAD, true));
  const headerH = Math.max(...header.map((l) => l.length)) * lineH + 6;

  const drawHeader = () => {
    w.box(M, w.y, w.right - M, headerH, { fill: TINT });
    let x = M;
    columns.forEach((col, i) => {
      header[i]!.forEach((l, j) => {
        const tx = col.align === "right" ? x + col.width - CELL_PAD : x + CELL_PAD;
        w.text(l, tx, w.y - 4 - (j + 1) * lineH + 2, size - 0.5, { bold: true, color: MUTED, align: col.align ?? "left" });
      });
      x += col.width;
    });
    w.y -= headerH;
  };

  const drawLaid = ({ laid, h }: ReturnType<typeof layRow>, fill?: RGB) => {
    if (fill) w.box(M, w.y, w.right - M, h, { fill });
    let x = M;
    columns.forEach((col, i) => {
      const c = laid[i]!;
      c.lines.forEach((l, j) => {
        const tx = col.align === "right" ? x + col.width - CELL_PAD : x + CELL_PAD;
        w.text(l.text, tx, w.y - 3 - (j + 1) * lineH + 2, size, { bold: l.bold, color: c.cell.color ?? DARK, align: col.align ?? "left" });
      });
      x += col.width;
    });
    w.y -= h;
    w.hline(M, w.right, w.y);
  };

  const laidRows = rows.map((r) => layRow(r));
  const totals = opts.totals ? layRow(opts.totals, true) : null;
  w.ensure(headerH + (laidRows[0]?.h ?? 0));
  drawHeader();
  laidRows.forEach((row, i) => {
    const need = row.h + (i === laidRows.length - 1 ? (totals?.h ?? 0) + (opts.keepAfter ?? 0) : 0);
    if (need > w.room) {
      w.newPage();
      sectionTitle(w, opts.continuedTitle, headerH + need);
      drawHeader();
    }
    drawLaid(row);
  });
  if (totals) drawLaid(totals, TINT);
  w.y -= 12;
}
