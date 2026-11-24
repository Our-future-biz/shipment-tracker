import { jsPDF } from "jspdf";
import { LOAD_LIST_COLUMNS, loadListFileName, type LoadList, type LoadListRow } from "./loadList";

// A sailing's load list as a PDF (Council Outlay 14, A8): A4 landscape, the sailing's facts on top,
// one row per shipment with the headings repeated on every page, the totals, and room to sign. Made
// in the browser from the model (lib loadList). Set in a face with Czech letters when its files load;
// in the PDF's own Helvetica, the accents taken off, when they do not.

const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 10;
const WIDTH = PAGE_W - 2 * MARGIN;
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#cbd5e1";
const HEAD = "#eef2ff";
const UNICODE_FACE = "DejaVuSans";

/** Column widths in mm, in the order of LOAD_LIST_COLUMNS; they add up to the page's width. */
const WIDTHS = [8, 28, 24, 36, 36, 11, 18, 19, 21, 30, 22, 24] as const;
const RIGHT = new Set([0, 5, 7, 8]);

export interface PdfFonts {
  regular: string;
  bold: string;
}

const toHelvetica = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/×/g, "x")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/[^ -~ -ÿ]/g, "?");

const cellsOf = (r: LoadListRow): string[] => [
  String(r.no),
  r.jobNumber,
  r.houseBol,
  r.shipper,
  r.consignee,
  r.colli > 0 ? r.colli.toLocaleString("en-US") : "",
  r.packages,
  r.weightKg > 0 ? r.weightKg.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "",
  r.volumeCbm > 0 ? r.volumeCbm.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
  r.cargo,
  r.marks.join(", "),
  r.delivery,
];

/** The load list as a PDF document. */
export function buildLoadListPdf(list: LoadList, fonts?: PdfFonts): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
  let face = "helvetica";
  if (fonts) {
    doc.addFileToVFS("DejaVuSans.ttf", fonts.regular);
    doc.addFont("DejaVuSans.ttf", UNICODE_FACE, "normal");
    doc.addFileToVFS("DejaVuSans-Bold.ttf", fonts.bold);
    doc.addFont("DejaVuSans-Bold.ttf", UNICODE_FACE, "bold");
    face = UNICODE_FACE;
  }
  const clean = (v: string) => (face === UNICODE_FACE ? v.replace(/\s/g, " ") : toHelvetica(v.replace(/\s/g, " ")));
  const font = (style: "normal" | "bold", size: number, colour = INK) => {
    doc.setFont(face, style);
    doc.setFontSize(size);
    doc.setTextColor(colour);
  };
  doc.setProperties({ title: toHelvetica(list.title) });

  // ── Title and the sailing's facts, four to a line ──
  font("bold", 16);
  doc.text(clean(list.title), MARGIN, MARGIN + 6);
  font("normal", 8, MUTED);
  doc.text(clean(`Made on ${list.madeOn}`), MARGIN + WIDTH, MARGIN + 6, { align: "right" });
  let y = MARGIN + 14;
  const factW = WIDTH / 4;
  list.facts.forEach(([label, value], i) => {
    const x = MARGIN + (i % 4) * factW;
    if (i > 0 && i % 4 === 0) y += 10;
    font("bold", 6.5, MUTED);
    doc.text(clean(label.toUpperCase()), x, y);
    font("bold", 9.5);
    doc.text(doc.splitTextToSize(clean(value || "—"), factW - 4)[0] ?? "", x, y + 4.5);
  });
  y += 11;

  // ── The table: headings on every page, a row as high as its longest cell ──
  const xs = WIDTHS.reduce<number[]>((acc, w, i) => [...acc, (acc[i - 1] ?? MARGIN) + (i > 0 ? WIDTHS[i - 1]! : 0)], []);
  const head = () => {
    doc.setFillColor(HEAD);
    doc.rect(MARGIN, y, WIDTH, 7, "F");
    font("bold", 6.5, MUTED);
    LOAD_LIST_COLUMNS.forEach((title, i) => doc.text(clean(title.toUpperCase()), RIGHT.has(i) ? xs[i]! + WIDTHS[i]! - 1.5 : xs[i]! + 1.5, y + 4.6, { align: RIGHT.has(i) ? "right" : "left" }));
    y += 7;
  };
  const LINE_H = 3.4;
  const drawRow = (cells: string[], bold = false) => {
    font(bold ? "bold" : "normal", 7.5);
    const wrapped = cells.map((cell, i) => (cell ? (doc.splitTextToSize(clean(cell), WIDTHS[i]! - 3) as string[]).slice(0, 6) : []));
    const height = Math.max(1, ...wrapped.map((w) => w.length)) * LINE_H + 2.6;
    if (y + height > PAGE_H - 16) {
      doc.addPage();
      y = MARGIN;
      head();
      font(bold ? "bold" : "normal", 7.5);
    }
    wrapped.forEach((lines, i) => lines.forEach((line, n) => doc.text(line, RIGHT.has(i) ? xs[i]! + WIDTHS[i]! - 1.5 : xs[i]! + 1.5, y + 4 + n * LINE_H, { align: RIGHT.has(i) ? "right" : "left" })));
    y += height;
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.15);
    doc.line(MARGIN, y, MARGIN + WIDTH, y);
  };
  head();
  if (list.rows.length === 0) drawRow(["", "No shipments in the box yet.", "", "", "", "", "", "", "", "", "", ""]);
  list.rows.forEach((r) => drawRow(cellsOf(r)));
  const t = list.totals;
  drawRow(
    ["", `Total: ${t.shipments} ${t.shipments === 1 ? "shipment" : "shipments"}`, "", "", "", t.colli.toLocaleString("en-US"), "", t.weightKg.toLocaleString("en-US", { maximumFractionDigits: 1 }), t.volumeCbm.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), "", "", ""],
    true,
  );
  if (list.cancelled > 0) {
    font("normal", 7.5, MUTED);
    doc.text(clean(`${list.cancelled} cancelled ${list.cancelled === 1 ? "shipment is" : "shipments are"} linked to the sailing and left off this list.`), MARGIN, y + 5);
    y += 6;
  }

  // ── Room to sign, kept together ──
  if (y + 22 > PAGE_H - 12) {
    doc.addPage();
    y = MARGIN;
  }
  y += 16;
  font("normal", 7.5, MUTED);
  ["Loaded by", "Checked by", "Date"].forEach((label, i) => {
    const x = MARGIN + i * (WIDTH / 3);
    doc.setDrawColor(MUTED);
    doc.setLineWidth(0.2);
    doc.line(x, y, x + WIDTH / 3 - 12, y);
    doc.text(label, x, y + 4);
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    font("normal", 7.5, MUTED);
    doc.text(clean("Weights and volumes are the shipments' declared figures, as Box utilization counts them."), MARGIN, PAGE_H - 7);
    doc.text(`Page ${page} of ${pages}`, MARGIN + WIDTH, PAGE_H - 7, { align: "right" });
  }
  return doc;
}

async function fontFile(path: string): Promise<string> {
  const reply = await fetch(path);
  if (!reply.ok) throw new Error(`Font ${path}: ${reply.status}`);
  const bytes = new Uint8Array(await reply.arrayBuffer());
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}

/** Makes the load list's PDF in the browser and hands it to the user as a download. Without the font files it is still made, in Helvetica. */
export async function downloadLoadListPdf(list: LoadList): Promise<void> {
  const fonts = await Promise.all([fontFile("/fonts/DejaVuSans.ttf"), fontFile("/fonts/DejaVuSans-Bold.ttf")]).then(
    ([regular, bold]) => ({ regular, bold }),
    () => undefined,
  );
  buildLoadListPdf(list, fonts).save(`${loadListFileName(list.title)}.pdf`);
}
