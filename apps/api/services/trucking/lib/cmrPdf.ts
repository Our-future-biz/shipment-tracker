import { rgb, type RGB } from "pdf-lib";
import type { CmrDoc, DocStop } from "./documentTypes";
import { formatDate, formatNumber, label, partyLines, stopAddressLines, titleLines, type LabelKey } from "./docFormat";
import { ACCENT, DARK, M, MUTED, RIGHT, WARN, Writer } from "./docPdf";

/**
 * The consignment note (nákladní list) of a domestic road consignment, laid out in the familiar
 * numbered CMR boxes 1–24 as one A4 form. Empty boxes (carrier's reservations, signatures, …) are
 * left for handwriting. Czech, English or both, as the document's language says.
 */

const FULL = RIGHT - M;
const HALF = FULL / 2;
const BORDER = rgb(0.6, 0.63, 0.7);
const MAX_LINES = 10; // per box, so a runaway note cannot push the form past one page

type Line = string | { text: string; bold?: boolean; color?: RGB };

interface Cell {
  num: number;
  key: LabelKey;
  width: number;
  lines: Line[];
  minH?: number;
}

export async function buildCmrPdf(doc: CmrDoc): Promise<Uint8Array> {
  const lang = doc.language;
  const L = (key: LabelKey) => label(lang, key);
  const title = titleLines(lang, "consignmentNote");
  const w = await Writer.create({ title: `${title.main} ${doc.consignmentRef}`, author: doc.sender.name, issuedAt: doc.issuedAt });

  // ── Header ──
  const top = w.y;
  w.text(title.main.toUpperCase(), M, top - 16, 15, { bold: true });
  let ly = top - 30;
  if (title.sub) {
    w.text(title.sub, M, ly, 9, { color: MUTED });
    ly -= 12;
  }
  w.text(L("domesticCarriage"), M, ly, 8.5, { color: MUTED });
  w.text(doc.consignmentRef, RIGHT, top - 16, 15, { bold: true, color: ACCENT, align: "right" });
  w.text(`${L("jobNo")}: ${doc.jobNumber}`, RIGHT, top - 30, 8.5, { color: MUTED, align: "right" });
  w.text(`${L("issued")}: ${formatDate(doc.issuedAt, lang)}`, RIGHT, top - 42, 8.5, { color: MUTED, align: "right" });
  w.y = Math.min(ly, top - 42) - 10;
  w.hline(M, RIGHT, w.y, ACCENT, 1.2);
  w.y -= 10;

  // ── Boxes 1–5 left, 16–20 right ──
  const carrier: Line[] = doc.carrier ? boldFirst(partyLines(doc.carrier, lang, true)) : [];
  if (doc.plates) carrier.push({ text: `${L("plates")}: ${doc.plates}`, bold: true });
  drawRow(w, lang, [
    { num: 1, key: "cmr1", width: HALF, lines: boldFirst(partyLines(doc.sender, lang, true)), minH: 62 },
    { num: 16, key: "cmr16", width: HALF, lines: carrier, minH: 62 },
  ]);
  drawRow(w, lang, [
    { num: 2, key: "cmr2", width: HALF, lines: boldFirst(partyLines(doc.consignee, lang, true)), minH: 62 },
    { num: 17, key: "cmr17", width: HALF, lines: [], minH: 62 },
  ]);
  drawRow(w, lang, [
    { num: 3, key: "cmr3", width: HALF, lines: stopLines(doc.placeOfDelivery, L), minH: 50 },
    { num: 18, key: "cmr18", width: HALF, lines: [], minH: 50 },
  ]);
  drawRow(w, lang, [
    { num: 4, key: "cmr4", width: HALF, lines: stopLines(doc.placeOfTakingOver, L), minH: 50 },
    { num: 19, key: "cmr19", width: HALF, lines: [], minH: 50 },
  ]);
  drawRow(w, lang, [
    { num: 5, key: "cmr5", width: HALF, lines: doc.documentsAttached ? [doc.documentsAttached] : [], minH: 30 },
    { num: 20, key: "cmr20", width: HALF, lines: [], minH: 30 },
  ]);

  // ── Goods: boxes 6–12 ──
  const load = doc.load;
  const nature: Line[] = [load.description || "—"];
  const handling = [load.nonStackable && L("nonStackable"), load.tailLift && L("tailLift")].filter(Boolean).join(", ");
  if (handling) nature.push({ text: handling, bold: true });
  if (load.adr) {
    const un = /^UN/i.test(load.adr.un) ? load.adr.un : `UN ${load.adr.un}`;
    const parts = [un, `${L("adrClass")} ${load.adr.className}`, load.adr.packingGroup && `${L("packingGroup")} ${load.adr.packingGroup}`];
    nature.push({ text: `ADR: ${parts.filter(Boolean).join(", ")}`, bold: true, color: WARN });
  }
  const packing = [`${formatNumber(load.palletPlaces, lang)} ${L("pallets")}`, `${L("ldm")} ${formatNumber(load.ldm, lang)}`];
  drawRow(w, lang, [
    { num: 6, key: "cmr6", width: 84, lines: [doc.consignmentRef] },
    { num: 7, key: "cmr7", width: 52, lines: [{ text: formatNumber(load.pieces, lang, 0), bold: true }] },
    { num: 8, key: "cmr8", width: 58, lines: packing },
    { num: 9, key: "cmr9", width: FULL - 84 - 52 - 58 - 50 - 56 - 50, lines: nature },
    { num: 10, key: "cmr10", width: 50, lines: [] },
    { num: 11, key: "cmr11", width: 56, lines: [{ text: formatNumber(load.weightKg, lang, 1), bold: true }] },
    { num: 12, key: "cmr12", width: 50, lines: [{ text: formatNumber(load.cbm, lang, 3), bold: true }] },
  ], 60);

  // ── Instructions, payment, cash on delivery, place and date ──
  drawRow(w, lang, [
    { num: 13, key: "cmr13", width: HALF, lines: doc.instructions ? [doc.instructions] : [], minH: 44 },
    { num: 15, key: "cmr15", width: HALF, lines: [], minH: 44 },
  ]);
  drawRow(w, lang, [
    { num: 14, key: "cmr14", width: HALF, lines: [], minH: 30 },
    { num: 21, key: "cmr21", width: HALF, lines: [[doc.sender.city, formatDate(doc.issuedAt, lang)].filter(Boolean).join(", ")], minH: 30 },
  ]);

  // ── Signatures 22–24 ──
  drawRow(w, lang, [
    { num: 22, key: "cmr22", width: FULL / 3, lines: [], minH: 64 },
    { num: 23, key: "cmr23", width: FULL / 3, lines: [], minH: 64 },
    { num: 24, key: "cmr24", width: FULL / 3, lines: [], minH: 64 },
  ]);

  return w.finish([`${title.main} ${doc.consignmentRef}  ·  ${L("jobNo")} ${doc.jobNumber}`, doc.sender.name]);
}

const boldFirst = (lines: string[]): Line[] => lines.map((l, i) => (i === 0 ? { text: l, bold: true } : l));

function stopLines(s: DocStop, L: (key: LabelKey) => string): Line[] {
  const lines: Line[] = stopAddressLines(s, true).map((l, i) => (i === 0 ? { text: l, bold: true } : l));
  if (s.windowText) lines.push({ text: s.windowText, bold: true });
  if (s.contact) lines.push(`${L("contact")}: ${s.contact}`);
  if (s.reference) lines.push(`${L("reference")}: ${s.reference}`);
  if (s.avizaceRequired) lines.push({ text: L("avizaceRequired"), bold: true, color: WARN });
  if (s.notes) lines.push(s.notes);
  return lines;
}

/** One row of numbered boxes side by side, all as tall as the tallest. */
function drawRow(w: Writer, lang: CmrDoc["language"], cells: Cell[], minH = 0) {
  const laid = cells.map((c) => {
    const inner = c.width - 12;
    // a wide box has its label beside the number, a narrow one under it
    const beside = c.width >= 120;
    const head = w.wrap(label(lang, c.key), 6, beside ? inner - 13 : inner);
    const body: { text: string; bold?: boolean; color?: RGB }[] = [];
    for (const line of c.lines) {
      const l = typeof line === "string" ? { text: line } : line;
      for (const part of w.wrap(l.text, 8, inner, l.bold)) body.push({ ...l, text: part });
    }
    if (body.length > MAX_LINES) body.splice(MAX_LINES - 1, body.length, { text: "…" });
    const headTop = beside ? 10 : 19;
    return { c, head, body, beside, headTop, h: headTop + head.length * 7.5 + (body.length ? 4 + body.length * 10 : 0) + 6 };
  });
  const h = Math.max(minH, ...laid.map((l) => Math.max(l.h, l.c.minH ?? 0)));
  w.ensure(h);
  const top = w.y;
  let x = M;
  for (const { c, head, body, beside, headTop } of laid) {
    w.box(x, top, c.width, h, { border: BORDER, borderWidth: 0.7 });
    w.text(String(c.num), x + 5, top - 10, 7.5, { bold: true, color: ACCENT });
    head.forEach((l, i) => w.text(l, x + (beside ? 19 : 6), top - headTop - i * 7.5, 6, { color: MUTED }));
    let y = top - headTop - head.length * 7.5 - 6;
    for (const b of body) {
      w.text(b.text, x + 6, y, 8, { bold: b.bold, color: b.color ?? DARK });
      y -= 10;
    }
    x += c.width;
  }
  w.y = top - h;
}
