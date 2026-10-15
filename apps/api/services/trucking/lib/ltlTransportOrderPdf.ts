import type { DocLanguage, DocLoad } from "./documentTypes";
import type { LtlTransportOrderDoc, TransportOrderStop } from "./ltlDocumentTypes";
import { formatDate, formatNumber, label, stopAddressLines, titleLines, type LabelKey } from "./docFormat";
import {
  ACCENT,
  drawCells,
  drawDocHeader,
  drawLoadDetails,
  drawOrderEnd,
  drawParties,
  drawPin,
  drawTable,
  issuedLine,
  M,
  orderFooter,
  sectionTitle,
  WARN,
  Writer,
  type TableCell,
  type TableColumn,
} from "./docPdf";

/**
 * The transport order for an LTL run or line haul: the Phase 4 transport order (parties, PIN,
 * vehicle, price, POD link, terms and signatures) with a table of the stops in order (kind,
 * place, time window, consignment ref, load) and their totals instead of one loading and one
 * unloading place. Czech, English or both, as the document's language says.
 */
export async function buildLtlTransportOrderPdf(doc: LtlTransportOrderDoc): Promise<Uint8Array> {
  const lang = doc.language;
  const L = (key: LabelKey) => label(lang, key);
  const title = titleLines(lang, "transportOrder");
  const w = await Writer.create({ title: `${title.main} ${doc.orderNumber}`, author: doc.ourCompany.name, issuedAt: doc.issuedAt });

  // ── Header, forwarder and haulier ──
  drawDocHeader(w, doc.ourCompany, title, doc.orderNumber, issuedLine(doc, L));
  drawParties(w, [L("forwarder"), doc.ourCompany], [L("haulier"), doc.haulier], lang);

  // ── References ──
  const refs: [string, string][] = [];
  if (doc.consignmentRef) refs.push([L("consignmentRef"), doc.consignmentRef]);
  if (doc.jobNumber) refs.push([L("jobNo"), doc.jobNumber]);
  refs.push([L("plannedPickup"), formatDate(doc.plannedPickupDate, lang)], [L("stopCount"), String(doc.stops.length)]);
  drawCells(w, refs);

  // ── Pick-up PIN (printed only, never logged) ──
  if (doc.pickupPin) drawPin(w, L("pickupPin"), L("pinHint"), doc.pickupPin);

  // ── Stops in order, with totals ──
  const columns: TableColumn[] = [
    { title: "#", width: 20, align: "right" },
    { title: L("stopKind"), width: 58 },
    { title: L("place"), width: 175 },
    { title: L("timeWindow"), width: 72 },
    { title: L("consignmentRef"), width: 84 },
    { title: L("load"), width: w.right - M - (20 + 58 + 175 + 72 + 84) },
  ];
  const t = doc.totals;
  sectionTitle(w, L("stops"), 60);
  drawTable(w, columns, doc.stops.map((s, i) => stopRow(s, i, L, lang)), {
    continuedTitle: `${L("stops")} (${L("continued")})`,
    totals: ["", L("total"), "", "", "", loadText(t.pieces, t.palletPlaces, t.ldm, t.weightKg, L, lang)],
  });

  // ── Load: description, handling, ADR ──
  sectionTitle(w, L("load"), 40);
  drawLoadDetails(w, doc.load, L);

  // ── Vehicle, price, POD link, terms and signatures ──
  drawOrderEnd(w, doc, L);

  return w.finish(orderFooter(doc, title.main, L));
}

function stopRow(s: TransportOrderStop, i: number, L: (key: LabelKey) => string, lang: DocLanguage): (string | TableCell)[] {
  const place = [
    ...stopAddressLines(s, true),
    s.contact,
    s.reference && `${L("reference")}: ${s.reference}`,
    s.avizaceRequired && `! ${L("avizaceRequired")}`,
    s.notes,
  ].filter(Boolean).join("\n");
  const pickup = s.kind === "PICKUP";
  return [
    String(i + 1),
    { text: L(pickup ? "stopPickup" : "stopDelivery"), bold: true, color: pickup ? ACCENT : undefined },
    { text: place, boldFirst: true },
    { text: s.windowText || "—", bold: Boolean(s.windowText) },
    { text: s.consignmentRef, bold: true },
    stopLoad(s.load, L, lang),
  ];
}

/** Quantities of a stop's load, plus the UN number in red when it is dangerous. */
function stopLoad(load: DocLoad, L: (key: LabelKey) => string, lang: DocLanguage): string | TableCell {
  const text = loadText(load.pieces, load.palletPlaces, load.ldm, load.weightKg, L, lang);
  if (!load.adr) return text;
  const un = /^UN/i.test(load.adr.un) ? load.adr.un : `UN ${load.adr.un}`;
  return { text: `${text}\nADR ${un}, ${load.adr.className}`, color: WARN };
}

/** "12 Ks · 4 Pal.\n2,4 LDM · 1 250 kg" */
function loadText(pieces: number, pallets: number, ldm: number, kg: number, L: (key: LabelKey) => string, lang: DocLanguage): string {
  return [
    `${formatNumber(pieces, lang, 0)} ${L("piecesShort")} · ${formatNumber(pallets, lang)} ${L("palletsShort")}`,
    `${formatNumber(ldm, lang)} LDM · ${formatNumber(kg, lang, 1)} kg`,
  ].join("\n");
}
