import type { DocStop } from "./documentTypes";
import type { ManifestDoc, ManifestRow } from "./ltlDocumentTypes";
import { formatDate, formatNumber, label, partyLines, stopAddressLines, titleLines, type LabelKey } from "./docFormat";
import { A4_LANDSCAPE, drawCells, drawDocHeader, drawTable, M, MUTED, WARN, Writer, type TableCell, type TableColumn } from "./docPdf";

/**
 * The run / line-haul manifest (nakládací list) handed to the driver: header with the trip ref,
 * kind and date, haulier, vehicle, plates and driver, from / to, one table row per consignment
 * (repeated header on every page), totals, the capacity used and signature lines for whoever
 * loaded, the driver and the receiving place. A4 landscape for the wide table; Czech, English or
 * both, as the document's language says.
 */

/** Column widths in points; the notes column takes what is left of the landscape content width. */
const WIDTHS = { seq: 30, ref: 80, job: 62, customer: 88, consignee: 100, destination: 92, pieces: 32, pallets: 34, ldm: 34, kg: 50, adr: 62 };
const SIGNATURES_H = 70;
const CAPACITY_H = 26;

export async function buildManifestPdf(doc: ManifestDoc): Promise<Uint8Array> {
  const lang = doc.language;
  const L = (key: LabelKey) => label(lang, key);
  const num = (v: number, decimals: number) => formatNumber(v, lang, decimals);
  const title = titleLines(lang, "manifest");
  const w = await Writer.create({ title: `${title.main} ${doc.tripRef}`, author: doc.ourCompany.name, issuedAt: doc.date }, A4_LANDSCAPE);
  const full = w.right - M;

  // ── Header: our company left, title, trip ref, kind and date right ──
  drawDocHeader(w, doc.ourCompany, title, doc.tripRef, `${doc.tripKindLabel}  ·  ${formatDate(doc.date, lang)}`);

  // ── Haulier, vehicle, plates, driver; from / to ──
  drawCells(w, [
    [L("haulier"), partyLines(doc.haulier, lang, true).slice(0, 2).join(", ")],
    [L("vehicleType"), doc.vehicleText],
    [L("plates"), doc.plates],
    [L("driver"), doc.driver],
  ]);
  w.y += 6;
  drawCells(w, [
    [L("from"), placeText(doc.from)],
    [L("to"), doc.to ? placeText(doc.to) : L("manyStops")],
  ]);

  // ── One row per consignment, totals ──
  const fixed = Object.values(WIDTHS).reduce((a, b) => a + b, 0);
  const columns: TableColumn[] = [
    { title: L("seq"), width: WIDTHS.seq, align: "right" },
    { title: L("consignmentRef"), width: WIDTHS.ref },
    { title: L("jobNo"), width: WIDTHS.job },
    { title: L("customer"), width: WIDTHS.customer },
    { title: L("consignee"), width: WIDTHS.consignee },
    { title: L("destination"), width: WIDTHS.destination },
    { title: L("piecesShort"), width: WIDTHS.pieces, align: "right" },
    { title: L("palletsShort"), width: WIDTHS.pallets, align: "right" },
    { title: L("ldm"), width: WIDTHS.ldm, align: "right" },
    { title: L("weightKg"), width: WIDTHS.kg, align: "right" },
    { title: L("adr"), width: WIDTHS.adr },
    { title: L("notes"), width: full - fixed },
  ];
  const row = (r: ManifestRow): (string | TableCell)[] => [
    String(r.seq),
    { text: r.consignmentRef, bold: true },
    r.jobNumber,
    r.customer,
    r.consignee,
    { text: `${r.toPostcode} ${r.toCity}`.trim(), bold: true },
    num(r.pieces, 0),
    num(r.palletPlaces, 2),
    num(r.ldm, 2),
    num(r.weightKg, 1),
    r.adr ? { text: r.adr, bold: true, color: WARN } : "",
    r.notes,
  ];
  const t = doc.totals;
  drawTable(w, columns, doc.rows.map(row), {
    continuedTitle: `${title.main} ${doc.tripRef} (${L("continued")})`,
    totals: ["", L("total"), "", "", "", "", num(t.pieces, 0), num(t.palletPlaces, 2), num(t.ldm, 2), num(t.weightKg, 1), "", ""],
    keepAfter: (doc.capacityText ? CAPACITY_H : 0) + SIGNATURES_H,
  });

  // ── Capacity used ──
  if (doc.capacityText) {
    w.ensure(CAPACITY_H);
    w.text(`${L("capacity")}:`, M, w.y - 10, 8.5, { bold: true, color: MUTED });
    w.text(doc.capacityText, M + w.width(`${L("capacity")}:`, 8.5, true) + 6, w.y - 10, 8.5, { bold: true });
    w.y -= CAPACITY_H;
  }

  // ── Signatures: loaded by, driver, received at ──
  drawSignatureLines(w, [L("loadedBy"), L("driver"), L("receivedAt")], L);

  const c = doc.ourCompany;
  return w.finish([
    [c.name, c.ico && `${L("ico")} ${c.ico}`, c.dic && `${L("dic")} ${c.dic}`].filter(Boolean).join("  ·  "),
    `${title.main} ${doc.tripRef}  ·  ${doc.tripKindLabel}  ·  ${formatDate(doc.date, lang)}`,
  ]);
}

/** "Sklad Kladno, Žižkova 845, 272 01 Kladno" plus the time window when set. */
function placeText(s: DocStop): string {
  return [stopAddressLines(s, true).join(", "), s.windowText].filter(Boolean).join("  ·  ");
}

/** Signature columns side by side: title, a line to sign on, then "Signature" and "Date". */
function drawSignatureLines(w: Writer, titles: string[], L: (key: LabelKey) => string) {
  const gap = 30;
  const colW = (w.right - M - gap * (titles.length - 1)) / titles.length;
  w.ensure(SIGNATURES_H);
  const top = w.y;
  titles.forEach((t, i) => {
    const x = M + i * (colW + gap);
    w.text(t.toUpperCase(), x, top - 10, 7.5, { bold: true, color: MUTED });
    const lineY = top - 46;
    w.hline(x, x + colW, lineY, MUTED, 0.6);
    w.text(L("signatureStamp"), x, lineY - 11, 7.5, { color: MUTED });
    w.text(`${L("date")}:`, x, lineY - 23, 7.5, { color: MUTED });
  });
  w.y = top - SIGNATURES_H;
}
