import { rgb } from "pdf-lib";
import type { LabelDoc } from "./ltlDocumentTypes";
import { code128BWidths } from "./code128";
import { formatNumber, formatQuantity, label, type LabelKey } from "./docFormat";
import { DARK, MUTED, WARN, Writer, type PageSize } from "./docPdf";

/**
 * Piece labels for LTL consignments: one 100 × 150 mm page per label, for a thermal label
 * printer. Big destination postcode and city, consignee and street, zone / service / piece
 * boxes, sender, job no., weight, the ADR mark and a "TAIL LIFT" badge when set, and the
 * consignment ref as a Code 128 barcode with the ref printed under it. Labels are bilingual.
 */

const MM = 72 / 25.4;
export const LABEL_SIZE: PageSize = { w: 100 * MM, h: 150 * MM };

const W = LABEL_SIZE.w;
const PAD = 10; // inner margin of the label
const INNER = W - 2 * PAD;
const BAR_H = 84; // barcode height
const MAX_MODULE = 1.5; // widest bar module, in points
const QUIET_MODULES = 10; // blank modules required left and right of the bars
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0); // bars in pure black for the scanners

const L = (key: LabelKey) => label("both", key);

export async function buildLabelsPdf(labels: LabelDoc[]): Promise<Uint8Array> {
  if (!labels.length) throw new Error("No labels to print");
  const first = labels[0]!;
  const w = await Writer.create({ title: `Labels ${first.consignmentRef}`, author: first.sender, issuedAt: "" }, LABEL_SIZE);
  labels.forEach((l, i) => {
    if (i > 0) w.newPage();
    drawLabel(w, l);
  });
  return w.doc.save();
}

function drawLabel(w: Writer, l: LabelDoc) {
  const top = LABEL_SIZE.h - PAD;

  // ── Sender and job no. ──
  w.text(L("sender").toUpperCase(), PAD, top - 7, 6, { color: MUTED });
  w.wrap(l.sender, 8, INNER - 90, true).slice(0, 2).forEach((s, i) => w.text(s, PAD, top - 17 - i * 10, 8, { bold: true }));
  w.text(L("jobNo").toUpperCase(), W - PAD, top - 7, 6, { color: MUTED, align: "right" });
  w.text(l.jobNumber, W - PAD, top - 18, 9, { bold: true, align: "right" });
  let y = top - 40;
  w.hline(PAD, W - PAD, y, DARK, 1);

  // ── Destination: postcode, city, consignee, street ──
  y -= 12;
  w.text(L("consignee").toUpperCase(), PAD, y, 6, { color: MUTED });
  y -= 38;
  w.text(l.toPostcode, PAD, y, 40, { bold: true });
  for (const s of w.wrap(l.toCity, 18, INNER, true).slice(0, 2)) {
    y -= 22;
    w.text(s, PAD, y, 18, { bold: true });
  }
  y -= 6;
  for (const s of w.wrap(l.consignee, 11, INNER, true).slice(0, 2)) {
    y -= 14;
    w.text(s, PAD, y, 11, { bold: true });
  }
  for (const s of w.wrap(l.toStreet, 9.5, INNER).slice(0, 2)) {
    y -= 12;
    w.text(s, PAD, y, 9.5);
  }
  y -= 10;

  // ── Zone, service level and piece number ──
  const piece = l.pieceNo !== null ? `${l.pieceNo} / ${l.pieceCount}` : formatNumber(l.pieceCount, "cs", 0);
  const cells: [string, string][] = [
    [L("zone"), l.zoneLabel],
    [L("service"), l.serviceLabel],
    [l.pieceNo !== null ? L("piece") : L("pieces"), piece],
  ];
  const cellW = INNER / cells.length;
  const cellH = 44;
  cells.forEach(([k, v], i) => {
    const x = PAD + i * cellW;
    w.box(x, y, cellW, cellH, { border: DARK, borderWidth: 1.2 });
    w.text(k, x + 5, y - 9, 5.5, { color: MUTED });
    const size = fitSize(w, v || "—", 16, cellW - 10);
    w.text(v || "—", x + cellW / 2, y - 32, size, { bold: true, align: "center" });
  });
  y -= cellH + 8;

  // ── Weight, ADR mark and tail lift badge ──
  w.text(L("weight").toUpperCase(), PAD, y - 7, 6, { color: MUTED });
  w.text(formatQuantity(l.weightKg, "kg", "cs", 1), PAD, y - 24, 14, { bold: true });
  let badgeRight = W - PAD;
  if (l.adr) {
    const r = 19;
    const cx = badgeRight - r;
    const cy = y - r - 1;
    w.page.drawSvgPath(`M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`, { x: cx, y: cy, color: WHITE, borderColor: WARN, borderWidth: 2.2 });
    w.text("ADR", cx, cy - 3.5, 10, { bold: true, color: WARN, align: "center" });
    badgeRight = cx - r - 8;
  }
  if (l.tailLift) {
    const text = "TAIL LIFT";
    const bw = w.width(text, 10, true) + 14;
    w.box(badgeRight - bw, y - 9, bw, 22, { fill: DARK });
    w.text(text, badgeRight - bw / 2, y - 23.5, 10, { bold: true, color: WHITE, align: "center" });
  }

  // ── Consignment ref as a Code 128 barcode, the ref under it ──
  drawBarcode(w, l.consignmentRef, PAD + 14 + BAR_H);
  w.text(l.consignmentRef, W / 2, PAD + 2, 11, { bold: true, align: "center" });
}

/**
 * Bars of `text` as Code 128 B, centred on the label with their top at `top`. The module is as
 * wide as fits (at most MAX_MODULE) with at least QUIET_MODULES blank modules on either side.
 */
function drawBarcode(w: Writer, text: string, top: number) {
  const widths = code128BWidths(text);
  const modules = widths.reduce((a, b) => a + b, 0);
  const module = Math.min(MAX_MODULE, (W - 2 * PAD) / (modules + 2 * QUIET_MODULES));
  let x = (W - modules * module) / 2;
  widths.forEach((n, i) => {
    if (i % 2 === 0) w.page.drawRectangle({ x, y: top - BAR_H, width: n * module, height: BAR_H, color: BLACK });
    x += n * module;
  });
}

/** The largest size up to `max` at which `text` fits `width` in bold. */
function fitSize(w: Writer, text: string, max: number, width: number): number {
  const at = w.width(text, max, true);
  return at <= width ? max : Math.max(6, (max * width) / at);
}
