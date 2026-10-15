import type { DocLanguage, DocLoad, DocParty, DocStop, TransportOrderDoc } from "./documentTypes";

// What the LTL documents print: the run / line-haul manifest (nakládací list), piece labels, and
// a transport order with several stops. Plain data; turned into PDFs by manifestPdf.ts,
// labelsPdf.ts and ltlTransportOrderPdf.ts.

export interface ManifestRow {
  seq: number;
  consignmentRef: string;
  jobNumber: string;
  customer: string;
  consignee: string;
  toPostcode: string; // as printed, "602 00"
  toCity: string;
  pieces: number;
  palletPlaces: number;
  ldm: number;
  weightKg: number;
  adr: string | null; // "UN 1263, 3, II" or null
  notes: string;
}

export interface ManifestDoc {
  language: DocLanguage;
  tripRef: string; // "LCZ2026000007"
  tripKindLabel: string; // "Line haul" / "Pick-up run" / "Delivery run" (already in the document's language)
  date: string; // YYYY-MM-DD
  ourCompany: DocParty;
  haulier: DocParty;
  vehicleText: string;
  plates: string;
  driver: string;
  from: DocStop;
  to: DocStop | null; // null for a run with many delivery stops
  rows: ManifestRow[];
  totals: { pieces: number; palletPlaces: number; ldm: number; weightKg: number };
  capacityText: string; // "13.6 LDM / 24 000 kg — 82 % LDM, 41 % kg"
}

export interface LabelDoc {
  consignmentRef: string;
  jobNumber: string;
  pieceNo: number | null; // null = one label for the whole consignment
  pieceCount: number;
  sender: string;
  consignee: string;
  toStreet: string;
  toPostcode: string; // "602 00"
  toCity: string;
  zoneLabel: string;
  serviceLabel: string; // "+1 day"
  adr: boolean;
  tailLift: boolean;
  weightKg: number;
}

export interface TransportOrderStop extends DocStop {
  kind: "PICKUP" | "DELIVERY";
  consignmentRef: string;
  load: DocLoad;
}

/** A transport order for an LTL run or line haul: the single pickup/delivery fields describe the trip's start and end. */
export interface LtlTransportOrderDoc extends TransportOrderDoc {
  stops: TransportOrderStop[];
  totals: { pieces: number; palletPlaces: number; ldm: number; weightKg: number };
}
