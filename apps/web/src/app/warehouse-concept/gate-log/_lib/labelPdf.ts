import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { GateMovement } from "@/hooks/useGateLog";
import { formatDate, formatDateTime } from "@/lib/date";
import { TERMS, directionOf } from "../../_lib/glossary";
import { drawCode128 } from "./code128";
import { businessToday } from "@/lib/date";

// jsPDF's built-in Helvetica has no Czech diacritics; print the plain letters instead.
const plain = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "");

const num = (v: number, digits = 0) =>
  v ? v.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace(/,/g, " ") : "";

/** Most labels in one print (all positions together). */
export const MAX_LABELS = 500;

/** Labels one position gets: one, or one per piece (n / N). */
export const labelCount = (m: Pick<GateMovement, "colli">, perPiece: boolean) => (perPiece ? Math.max(1, Math.floor(m.colli || 0)) : 1);

export const labelRef = (m: Pick<GateMovement, "positionRef" | "gateRef">) => m.positionRef || m.gateRef;

// Label zones on 100 × 150 mm (the usual thermal label), fixed so text can never reach the codes:
//   header 6–24 · text rows 30–88 · piece counter ~93 · barcode 97–113 (ref under it at 117)
//   · QR 22 mm at 7 / 123.5 (4 mm clear under the divider for its quiet zone) · footer text right of the QR.
const W = 100;
const MARGIN = 7;
const ROWS_TOP = 31;
const ROWS_BOTTOM = 88;
const ROW_HEIGHT = 6;
const LABEL_COL = 30;

// Cut a value to the width left on its row ("..." — the standard fonts have no ellipsis sign).
function fit(doc: jsPDF, text: string, maxWidth: number) {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}...`) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

function drawLabel(doc: jsPDF, m: GateMovement, qr: string, piece?: { n: number; total: number }) {
  const ref = labelRef(m);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(TERMS.warehouseRef.toUpperCase(), MARGIN, 11);
  doc.setTextColor(0);
  doc.setFont("courier", "bold");
  doc.setFontSize(24);
  doc.text(fit(doc, plain(ref), W - MARGIN * 2), W / 2, 21, { align: "center" });
  doc.setLineWidth(0.6);
  doc.line(MARGIN, 25, W - MARGIN, 25);

  const rows: [string, string][] = [
    ["Customer", m.customer],
    [TERMS.jobNo, m.jobNumber],
    [TERMS.direction, directionOf(m)],
    ["Operation", m.operationType],
    [TERMS.pieces, m.colli ? `${num(m.colli)}${m.packing ? ` ${m.packing}` : ""}` : m.packing],
    [TERMS.weightKg, m.weightKg ? num(m.weightKg) : ""],
    [TERMS.volumeCbm, m.measureCbm ? num(m.measureCbm, 2) : ""],
    ["Commodity", m.commodity],
    ["Customs", [m.customsMode, m.mrn].filter(Boolean).join(" · ")],
  ];
  // One line per row; a row that would pass the text zone is left off.
  let y = ROWS_TOP;
  for (const [label, value] of rows) {
    if (y > ROWS_BOTTOM) break;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100);
    doc.text(label.toUpperCase(), MARGIN, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(0);
    doc.text(fit(doc, plain(value || "-"), W - MARGIN * 2 - LABEL_COL), MARGIN + LABEL_COL, y);
    y += ROW_HEIGHT;
  }

  if (piece) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(`${piece.n} / ${piece.total}`, W / 2, 94, { align: "center" });
  }

  // Code 128 of the reference for handheld scanners; a reference it cannot encode prints without.
  try {
    drawCode128(doc, MARGIN, 97, W - MARGIN * 2, 16, ref);
    doc.setFont("courier", "bold");
    doc.setFontSize(9);
    doc.text(plain(ref), W / 2, 117.5, { align: "center" });
  } catch {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text("no barcode for this reference", W / 2, 106, { align: "center" });
    doc.setTextColor(0);
  }

  doc.setLineWidth(0.3);
  doc.line(MARGIN, 119.5, W - MARGIN, 119.5);
  doc.addImage(qr, "PNG", MARGIN, 123.5, 22, 22, undefined, "FAST");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100);
  doc.text(`Recorded ${formatDate(m.createdAt)}`, MARGIN + 27, 130);
  doc.text(`Printed ${formatDateTime(new Date().toISOString())}`, MARGIN + 27, 136);
  doc.setTextColor(0);
}

/**
 * Builds one PDF with one label per page — per position, or one per piece (n / N) — and
 * downloads it (WCZ….pdf for one position, labels-<date>.pdf for several). The QR code holds
 * only the warehouse ref. Returns how many labels each movement got, for the print log.
 */
export async function downloadLabels(ms: GateMovement[], { perPiece }: { perPiece: boolean }): Promise<{ id: string; copies: number }[]> {
  const copies = ms.map((m) => ({ id: m.id, copies: labelCount(m, perPiece) }));
  const total = copies.reduce((s, c) => s + c.copies, 0);
  if (!total) throw new Error("Nothing to print");
  if (total > MAX_LABELS) throw new Error(`${total} labels is more than ${MAX_LABELS} in one print — pick fewer positions`);

  const doc = new jsPDF({ unit: "mm", format: [W, 150], compress: true });
  let first = true;
  for (const m of ms) {
    const qr = await QRCode.toDataURL(labelRef(m), { errorCorrectionLevel: "M", margin: 0, width: 300 });
    const n = labelCount(m, perPiece);
    for (let i = 1; i <= n; i++) {
      if (!first) doc.addPage([W, 150]);
      first = false;
      drawLabel(doc, m, qr, perPiece ? { n: i, total: n } : undefined);
    }
  }
  doc.save(ms.length === 1 ? `${labelRef(ms[0]!)}.pdf` : `labels-${businessToday()}.pdf`);
  return copies;
}
