import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { wrapText } from "./docFormat";

/**
 * The small page writer the trucking documents share: A4 pages, DejaVu Sans (covers Czech
 * diacritics, which the built-in PDF fonts cannot print), wrapping, page breaks and the footer
 * with page numbers. Same look as the invoice PDF (services/invoicing/lib/invoicePdf.ts).
 */

export const DARK = rgb(0.11, 0.13, 0.2);
export const MUTED = rgb(0.4, 0.43, 0.5);
export const LINE = rgb(0.85, 0.87, 0.9);
export const TINT = rgb(0.93, 0.94, 0.99);
export const ACCENT = rgb(0.25, 0.3, 0.75);
export const WARN = rgb(0.75, 0.2, 0.12);
export const WARN_TINT = rgb(0.99, 0.94, 0.92);

export const A4 = { w: 595.28, h: 841.89 };
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
  ) {
    this.newPage();
  }

  /** A new document with its metadata set; dated `issuedAt` so the same data gives the same bytes. */
  static async create(meta: { title: string; author: string; issuedAt: string }): Promise<Writer> {
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
    return new Writer(doc, regular, bold);
  }

  newPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.pages.push(this.page);
    this.y = A4.h - M;
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
      this.hline(M, RIGHT, M + 26);
      footer.forEach((f, j) => this.text(f, M, M + 15 - j * 9, 7, { color: MUTED }));
      this.text(`${i + 1} / ${total}`, RIGHT, M + 15, 8, { color: MUTED, align: "right" });
    });
    return this.doc.save();
  }
}

/** No-break and narrow no-break spaces as plain spaces, tabs as spaces. */
function clean(t: string): string {
  return t.replace(/[  \t]/g, " ");
}
