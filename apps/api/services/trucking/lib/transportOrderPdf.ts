import type { RGB } from "pdf-lib";
import type { DocLoad, DocParty, DocStop, TransportOrderDoc } from "./documentTypes";
import { formatDate, formatMoney, formatNumber, formatQuantity, label, partyLines, stopAddressLines, titleLines, type LabelKey } from "./docFormat";
import { ACCENT, BOTTOM, DARK, LINE, M, MUTED, RIGHT, TINT, WARN, WARN_TINT, Writer } from "./docPdf";

/**
 * The transport order (přepravní příkaz) we send to the haulier for one trip: parties, loading
 * and unloading places, the load (with ADR when dangerous), vehicle, agreed price, the pick-up
 * PIN, the POD link and the numbered terms, with signature lines for both sides. Czech, English
 * or both, as the document's language says. Multi-page when the notes or terms are long.
 */

const FULL = RIGHT - M;
const LABEL_W = 132; // label column of the field rows
const VALUE_X = M + 8 + LABEL_W + 10;
const VALUE_W = RIGHT - 8 - VALUE_X;
const SIGNATURE_COL_W = (FULL - 40) / 2;

interface Row {
  label: string;
  value: string;
  bold?: boolean;
  color?: RGB;
}

export async function buildTransportOrderPdf(doc: TransportOrderDoc): Promise<Uint8Array> {
  const lang = doc.language;
  const L = (key: LabelKey) => label(lang, key);
  const title = titleLines(lang, "transportOrder");
  const w = await Writer.create({ title: `${title.main} ${doc.orderNumber}`, author: doc.ourCompany.name, issuedAt: doc.issuedAt });

  // ── Header: our company left, document title + number right ──
  const top = w.y;
  const halfW = FULL / 2 - 10;
  let ly = top - 16;
  for (const l of w.wrap(doc.ourCompany.name, 14, halfW, true)) {
    w.text(l, M, ly, 14, { bold: true });
    ly -= 17;
  }
  const address = [doc.ourCompany.street, [doc.ourCompany.postcode, doc.ourCompany.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  for (const l of w.wrap(address, 8.5, halfW)) {
    w.text(l, M, ly, 8.5, { color: MUTED });
    ly -= 11;
  }
  w.text(title.main.toUpperCase(), RIGHT, top - 12, 13, { bold: true, align: "right" });
  if (title.sub) w.text(title.sub, RIGHT, top - 26, 9, { color: MUTED, align: "right" });
  w.text(doc.orderNumber, RIGHT, top - 44, 15, { bold: true, color: ACCENT, align: "right" });
  w.text(`${L("issued")}: ${formatDate(doc.issuedAt, lang)}`, RIGHT, top - 58, 8.5, { color: MUTED, align: "right" });
  w.y = Math.min(top - 66, ly - 4);
  w.hline(M, RIGHT, w.y, ACCENT, 1.2);
  w.y -= 16;

  // ── Forwarder and haulier ──
  drawParties(w, [L("forwarder"), doc.ourCompany], [L("haulier"), doc.haulier], lang);

  // ── References ──
  drawCells(w, [
    [L("consignmentRef"), doc.consignmentRef],
    [L("jobNo"), doc.jobNumber],
    [L("plannedPickup"), formatDate(doc.plannedPickupDate, lang)],
  ]);

  // ── Pick-up PIN (printed only, never logged) ──
  if (doc.pickupPin) drawPin(w, L("pickupPin"), L("pinHint"), doc.pickupPin);

  // ── Loading and unloading places ──
  drawRows(w, L("loadingPlace"), stopRows(doc.pickup, L), L);
  drawRows(w, L("unloadingPlace"), stopRows(doc.delivery, L), L);

  // ── Load ──
  drawLoad(w, doc.load, L, lang);

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

  const c = doc.ourCompany;
  return w.finish([
    [c.name, c.ico && `${L("ico")} ${c.ico}`, c.dic && `${L("dic")} ${c.dic}`].filter(Boolean).join("  ·  "),
    `${title.main} ${doc.orderNumber}`,
  ]);
}

/** Two party boxes side by side, like the invoice's supplier and customer. */
function drawParties(w: Writer, left: [string, DocParty], right: [string, DocParty], lang: TransportOrderDoc["language"]) {
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

/** A tinted strip of equal cells: small label above, bold value below (values wrap). */
function drawCells(w: Writer, items: [string, string][], opts: { fill?: RGB; border?: RGB; valueColor?: RGB } = {}) {
  const cellW = FULL / items.length;
  const laid = items.map(([k, v]) => ({ k: w.wrap(k, 7, cellW - 16), v: w.wrap(v || "—", 10, cellW - 16, true) }));
  const h = Math.max(...laid.map((c) => 14 + c.k.length * 9 + c.v.length * 13)) + 2;
  w.ensure(h);
  const top = w.y;
  w.box(M, top, FULL, h, { fill: opts.fill ?? TINT, border: opts.border });
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

function drawPin(w: Writer, title: string, hint: string, pin: string) {
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

/** A tinted section title bar; starts a new page first when the bar and `next` points do not fit. */
function sectionTitle(w: Writer, title: string, next: number) {
  w.ensure(22 + next);
  w.box(M, w.y, FULL, 20, { fill: TINT });
  w.text(title.toUpperCase(), M + 8, w.y - 13.5, 8, { bold: true, color: MUTED });
  w.y -= 24;
}

/** A section of label / value rows under a title bar. */
function drawRows(w: Writer, title: string, rows: Row[], L: (key: LabelKey) => string) {
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

function stopRows(s: DocStop, L: (key: LabelKey) => string): Row[] {
  const rows: Row[] = [{ label: L("address"), value: stopAddressLines(s).join("\n") || "—", bold: true }];
  if (s.windowText) rows.push({ label: L("timeWindow"), value: s.windowText, bold: true });
  if (s.contact) rows.push({ label: L("contact"), value: s.contact });
  if (s.reference) rows.push({ label: L("reference"), value: s.reference });
  if (s.avizaceRequired) rows.push({ label: L("avizace"), value: L("avizaceRequired"), bold: true, color: WARN });
  if (s.notes) rows.push({ label: L("notes"), value: s.notes });
  return rows;
}

function drawLoad(w: Writer, load: DocLoad, L: (key: LabelKey) => string, lang: TransportOrderDoc["language"]) {
  sectionTitle(w, L("load"), 50);
  drawCells(w, [
    [L("pieces"), formatNumber(load.pieces, lang, 0)],
    [L("palletPlaces"), formatNumber(load.palletPlaces, lang)],
    [L("ldm"), formatNumber(load.ldm, lang)],
    [L("weight"), formatQuantity(load.weightKg, "kg", lang, 1)],
    [L("volume"), formatQuantity(load.cbm, "m³", lang, 3)],
  ], { fill: TINT });
  w.y += 6;
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

/** The two signature blocks wrapped, with the height they need. */
function layoutSignatures(w: Writer, left: [string, string], right: [string, string]) {
  const colW = SIGNATURE_COL_W;
  const blocks = [left, right].map(([title, name]) => ({ title: w.wrap(title.toUpperCase(), 7.5, colW, true), name: w.wrap(name, 9, colW, true) }));
  const head = Math.max(...blocks.map((b) => b.title.length * 10 + b.name.length * 12));
  return { blocks, head, height: head + 80 };
}

function drawSignatures(w: Writer, { blocks, head, height }: ReturnType<typeof layoutSignatures>, L: (key: LabelKey) => string) {
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
