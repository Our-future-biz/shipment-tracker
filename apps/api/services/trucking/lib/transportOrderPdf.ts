import type { TransportOrderDoc } from "./documentTypes";
import { formatDate, label, titleLines, type LabelKey } from "./docFormat";
import { drawCells, drawDocHeader, drawLoad, drawOrderEnd, drawParties, drawPin, drawPinNote, drawRows, issuedLine, orderFooter, stopRows, Writer } from "./docPdf";

/**
 * The transport order (přepravní příkaz) we send to the haulier for one trip: parties, loading
 * and unloading places, the load (with ADR when dangerous), vehicle, agreed price, the pick-up
 * PIN, the POD link and the numbered terms, with signature lines for both sides. Czech, English
 * or both, as the document's language says. Multi-page when the notes or terms are long.
 */
export async function buildTransportOrderPdf(doc: TransportOrderDoc): Promise<Uint8Array> {
  const lang = doc.language;
  const L = (key: LabelKey) => label(lang, key);
  const title = titleLines(lang, "transportOrder");
  const w = await Writer.create({ title: `${title.main} ${doc.orderNumber}`, author: doc.ourCompany.name, issuedAt: doc.issuedAt });

  // ── Header: our company left, document title + number right ──
  drawDocHeader(w, doc.ourCompany, title, doc.orderNumber, issuedLine(doc, L));

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
  else if (doc.pinAsGiven) drawPinNote(w, L("pickupPin"), L("pinAsGiven"));

  // ── Loading and unloading places ──
  drawRows(w, L("loadingPlace"), stopRows(doc.pickup, L), L);
  drawRows(w, L("unloadingPlace"), stopRows(doc.delivery, L), L);

  // ── Load ──
  drawLoad(w, doc.load, L, lang);

  // ── Vehicle, price, POD link, terms and signatures ──
  drawOrderEnd(w, doc, L);

  return w.finish(orderFooter(doc, title.main, L));
}
