// What the trucking documents (transport order, CMR / consignment note) print. Built by the
// trucking service from a trip and its consignment; turned into PDFs by transportOrderPdf.ts and
// cmrPdf.ts. Plain data only, so the PDF builders stay pure and testable.

export type DocLanguage = "cs" | "en" | "both";

export interface DocParty {
  name: string;
  street: string;
  postcode: string; // as printed, "110 00"
  city: string;
  country: string; // ISO 2
  ico: string;
  dic: string;
  contact: string; // name, phone, e-mail on one line
}

export interface DocStop {
  name: string;
  street: string;
  postcode: string;
  city: string;
  country: string;
  windowText: string; // "16 Oct 2026, 08:00–12:00" or ""
  contact: string;
  reference: string;
  notes: string;
  avizaceRequired: boolean;
}

export interface DocLoad {
  pieces: number;
  palletPlaces: number;
  ldm: number;
  weightKg: number;
  cbm: number;
  description: string;
  nonStackable: boolean;
  tailLift: boolean;
  adr: { un: string; className: string; packingGroup: string } | null;
}

export interface TransportOrderDoc {
  language: DocLanguage;
  orderNumber: string; // the trip ref, "LCZ2026000001"
  issuedAt: string; // ISO
  ourCompany: DocParty; // forwarder (zasílatel)
  haulier: DocParty;
  consignmentRef: string; // "TCZ2026000001"
  jobNumber: string;
  plannedPickupDate: string; // YYYY-MM-DD
  pickup: DocStop;
  delivery: DocStop;
  load: DocLoad;
  vehicleText: string; // "Tautliner 13.6 m, tail lift" or ""
  plates: string; // "1AB2345 / 2CD6789" or ""
  driver: string; // "Jan Novák, +420 …" or ""
  agreedPrice: { total: number; currency: string; note: string } | null;
  paymentTerms: string; // "30 days after invoice with original POD"
  pickupPin: string | null; // printed only; never stored
  pinAsGiven?: boolean; // no PIN printed: "Pick-up PIN as given by the dispatcher" (the haulier portal's copy)
  podLink: string | null; // URL for confirmation and POD upload
  terms: string[]; // numbered conditions printed at the end (SSL terms reference, liability, ADR, …)
}

export interface CmrDoc {
  language: DocLanguage;
  consignmentRef: string;
  jobNumber: string;
  issuedAt: string;
  sender: DocParty;
  consignee: DocParty;
  carrier: DocParty | null; // haulier when known
  placeOfTakingOver: DocStop;
  placeOfDelivery: DocStop;
  load: DocLoad;
  documentsAttached: string;
  instructions: string;
  plates: string;
}
