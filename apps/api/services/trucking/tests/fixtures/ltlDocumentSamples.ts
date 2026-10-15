import type { DocLoad, DocStop } from "../../lib/documentTypes";
import type { LabelDoc, LtlTransportOrderDoc, ManifestDoc, ManifestRow, TransportOrderStop } from "../../lib/ltlDocumentTypes";
import { sampleTransportOrder } from "./documentSamples";

// Sample LTL documents for the PDF tests: a 40-row manifest, three labels (one ADR) and a
// transport order with six stops. Czech characters throughout.

const cities = [
  ["602 00", "Brno"],
  ["702 00", "Ostrava"],
  ["370 01", "České Budějovice"],
  ["301 00", "Plzeň"],
  ["500 02", "Hradec Králové"],
  ["460 01", "Liberec"],
  ["779 00", "Olomouc"],
  ["586 01", "Jihlava"],
] as const;

export const manifestRows: ManifestRow[] = Array.from({ length: 40 }, (_, i) => {
  const [postcode, city] = cities[i % cities.length]!;
  return {
    seq: i + 1,
    consignmentRef: `TCZ20260${String(1000 + i).padStart(5, "0")}`,
    jobNumber: `CZ000${String(100 + i)}`,
    customer: i % 3 === 0 ? "Příliš žluťoučký kůň a.s." : "Barvy Šťastný s.r.o.",
    consignee: i % 4 === 0 ? "Odběratel Ostrava – centrální sklad, s.r.o." : `Prodejna Novák ${i + 1}`,
    toPostcode: postcode,
    toCity: city,
    pieces: 1 + (i % 5),
    palletPlaces: 1 + (i % 3) * 0.5,
    ldm: 0.4 + (i % 3) * 0.2,
    weightKg: 120 + i * 17.5,
    adr: i % 9 === 4 ? "UN 1263, 3, II" : null,
    notes: i % 6 === 2 ? "Avízo den předem, vykládka rampou č. 2" : "",
  };
});

const sum = (key: "pieces" | "palletPlaces" | "ldm" | "weightKg") => manifestRows.reduce((a, r) => a + r[key], 0);

const depot: DocStop = { ...sampleTransportOrder.pickup, name: "Depo Praha – Zličín", street: "Na Radosti 410", postcode: "155 21", city: "Praha 5", notes: "" };

export const sampleManifest: ManifestDoc = {
  language: "both",
  tripRef: "LCZ2026000007",
  tripKindLabel: "Linehaul / Line haul",
  date: "2026-10-16",
  ourCompany: sampleTransportOrder.ourCompany,
  haulier: sampleTransportOrder.haulier,
  vehicleText: "Plachta 13,6 m, hydraulické čelo",
  plates: "1AB2345 / 2CD6789",
  driver: "Jan Novák, +420 608 765 432",
  from: depot,
  to: { ...sampleTransportOrder.delivery, name: "Depo Brno – Černovice", street: "Táborská 200", postcode: "618 00", city: "Brno" },
  rows: manifestRows,
  totals: { pieces: sum("pieces"), palletPlaces: sum("palletPlaces"), ldm: sum("ldm"), weightKg: sum("weightKg") },
  capacityText: "13,6 LDM / 24 000 kg — 82 % LDM, 41 % kg",
};

const label: LabelDoc = {
  consignmentRef: "TCZ2026001234",
  jobNumber: "CZ00000142",
  pieceNo: 1,
  pieceCount: 3,
  sender: "Barvy Šťastný s.r.o., Kladno",
  consignee: "Odběratel Ostrava, s.r.o.",
  toStreet: "Mostní 1",
  toPostcode: "702 00",
  toCity: "Ostrava",
  zoneLabel: "MS-2",
  serviceLabel: "+1 den",
  adr: false,
  tailLift: false,
  weightKg: 412.5,
};

export const sampleLabels: LabelDoc[] = [
  label,
  { ...label, pieceNo: 2, adr: true, tailLift: true },
  { ...label, consignmentRef: "TCZ2026001240", pieceNo: null, pieceCount: 12, toCity: "České Budějovice", toPostcode: "370 01", zoneLabel: "JC-1" },
];

const stopLoad = (pieces: number, kg: number, adr = false): DocLoad => ({
  ...sampleTransportOrder.load,
  pieces,
  palletPlaces: pieces,
  ldm: pieces * 0.4,
  weightKg: kg,
  adr: adr ? sampleTransportOrder.load.adr : null,
});

const stop = (i: number, kind: TransportOrderStop["kind"], name: string, city: string, load: DocLoad): TransportOrderStop => ({
  ...sampleTransportOrder.delivery,
  kind,
  name,
  city,
  notes: i === 3 ? "Vjezd ze zadní ulice, zvonit u brány." : "",
  avizaceRequired: i === 2,
  consignmentRef: `TCZ20260012${30 + i}`,
  windowText: `16. 10. 2026, ${String(7 + i).padStart(2, "0")}:00–${String(9 + i).padStart(2, "0")}:00`,
  load,
});

const stops: TransportOrderStop[] = [
  stop(0, "PICKUP", "Barvy Šťastný s.r.o.", "Kladno", stopLoad(4, 900, true)),
  stop(1, "PICKUP", "Příliš žluťoučký kůň a.s.", "Beroun", stopLoad(2, 420)),
  stop(2, "DELIVERY", "Prodejna Novák Říčany", "Říčany", stopLoad(2, 450, true)),
  stop(3, "DELIVERY", "Odběratel Kolín, s.r.o.", "Kolín", stopLoad(1, 210)),
  stop(4, "DELIVERY", "Ústřední sklad Čáslav", "Čáslav", stopLoad(2, 450)),
  stop(5, "DELIVERY", "Železářství Kutná Hora", "Kutná Hora", stopLoad(1, 210)),
];

export const sampleLtlTransportOrder: LtlTransportOrderDoc = {
  ...sampleTransportOrder,
  orderNumber: "LCZ2026000009",
  consignmentRef: "",
  jobNumber: "",
  stops,
  totals: { pieces: 6, palletPlaces: 6, ldm: 2.4, weightKg: 1320 },
};
