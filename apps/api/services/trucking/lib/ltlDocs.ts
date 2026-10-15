import { fmt, showPostcode } from "./rateEngine";
import { docLoad, docStop, platesText, say, transportOrderDoc, transportOrderTerms, vehicleText } from "./truckingDocs";
import { TRIP_KIND_LABEL } from "./ltlRules";
import type { DocLanguage, DocLoad, DocParty } from "./documentTypes";
import type { LabelDoc, LtlTransportOrderDoc, ManifestDoc, ManifestRow, TransportOrderStop } from "./ltlDocumentTypes";
import type { HubAddress, LegKind, LoadInput, LtlTripKind, PriceSnapshot, StopInput, TripCapacity, TripFill } from "../interfaces/interfaces";

// What the LTL documents print (lib/ltlDocumentTypes.ts): the manifest of a run or line haul,
// the piece labels and the transport order with every stop. Built from the trip, its legs in
// stop order and their consignments. Pure; the PDF builders only lay them out.

/** A consignment as the LTL documents need it. */
export interface DocConsignment {
  ref: string;
  jobNumber: string;
  customerName: string;
  pickup: StopInput;
  delivery: StopInput;
  load: LoadInput;
}

/** A leg on the trip with its consignment, in stop order. */
export interface DocLeg {
  kind: LegKind;
  /** The far end of a line haul (the partner's depot) as stored on the leg */
  toText: string;
  toPostcode: string;
  consignment: DocConsignment;
}

export interface DocTrip {
  ref: string;
  kind: LtlTripKind;
  plannedPickupDate: string;
  tractorPlate: string;
  trailerPlate: string;
  driverName: string;
  driverPhone: string;
  buy: PriceSnapshot | null;
}

const joinNonEmpty = (parts: string[], sep = ", ") => parts.map((p) => p.trim()).filter(Boolean).join(sep);

/** "UN 1263, 3, II" or null. */
export const adrText = (l: LoadInput): string | null => (l.adr ? joinNonEmpty([`UN ${l.adrUn}`, l.adrClass, l.adrPackingGroup]) : null);

/** Our warehouse as a stop. */
export function hubStop(h: HubAddress): StopInput {
  return {
    siteId: null,
    name: h.name,
    street: h.street,
    postcode: h.postcode,
    city: h.city,
    country: "CZ",
    windowFrom: null,
    windowTo: null,
    contactName: "",
    contactPhone: "",
    avizaceRequired: false,
    reference: "",
    notes: "",
  };
}

/** A partner's depot as a stop, from what the leg stores ("Beta depot, 602 00 Brno"). */
export function depotStop(text: string, postcode: string): StopInput {
  return { ...hubStop({ name: text, street: "", postcode, city: "", country: "CZ" }), postcode };
}

/** The summed load of the legs (ADR: the first ADR consignment's). */
export function summedLoad(loads: LoadInput[], description: string): DocLoad {
  const sum = (f: (l: LoadInput) => number) => Math.round(loads.reduce((a, l) => a + f(l), 0) * 100) / 100;
  const adr = loads.find((l) => l.adr);
  return {
    pieces: sum((l) => l.pieces),
    palletPlaces: sum((l) => l.palletPlaces),
    ldm: sum((l) => l.ldm),
    weightKg: sum((l) => l.weightKg),
    cbm: sum((l) => l.cbm),
    description,
    nonStackable: loads.some((l) => l.nonStackable),
    tailLift: loads.some((l) => l.tailLift),
    adr: adr ? docLoad(adr).adr : null,
  };
}

const totalsOf = (loads: LoadInput[]) => {
  const s = summedLoad(loads, "");
  return { pieces: s.pieces, palletPlaces: s.palletPlaces, ldm: s.ldm, weightKg: s.weightKg };
};

/** "13.6 LDM / 24 000 kg — 82 % LDM, 41 % kg", "" without a vehicle. */
export function capacityText(cap: TripCapacity | null, fill: TripFill): string {
  if (!cap) return "";
  return `${fmt(cap.ldm)} LDM / ${fmt(cap.kg)} kg — ${fmt(fill.ldmPercent ?? 0)} % LDM, ${fmt(fill.kgPercent ?? 0)} % kg`;
}

/** Where a trip starts and ends: a pick-up run ends at our warehouse, a line haul ends at the depot, a delivery run has many ends. */
export function tripEnds(kind: LtlTripKind, legs: DocLeg[], hub: StopInput): { from: StopInput; to: StopInput | null } {
  if (kind === "PICKUP_RUN") return { from: legs[0]?.consignment.pickup ?? hub, to: hub };
  if (kind === "LINEHAUL") return { from: hub, to: legs[0] ? depotStop(legs[0].toText, legs[0].toPostcode) : null };
  return { from: hub, to: null };
}

const legNotes = (c: DocConsignment, language: DocLanguage) =>
  joinNonEmpty(
    [
      c.load.tailLift ? say(language, "čelo", "tail lift") : "",
      c.load.nonStackable ? say(language, "nestohovat", "do not stack") : "",
      c.delivery.avizaceRequired ? say(language, "avizace", "call before delivery") : "",
      c.delivery.notes,
    ],
    "; ",
  );

export interface ManifestInput {
  language: DocLanguage;
  trip: DocTrip;
  ourCompany: DocParty;
  haulier: DocParty;
  vehicle: { label: string; tailLift: boolean } | null;
  capacity: TripCapacity | null;
  fill: TripFill;
  hub: HubAddress;
  legs: DocLeg[];
}

/** The manifest (nakládací list) of a run or a line haul: one row per leg, in stop order. */
export function manifestDoc(i: ManifestInput): ManifestDoc {
  const hub = hubStop(i.hub);
  const ends = tripEnds(i.trip.kind, i.legs, hub);
  const rows: ManifestRow[] = i.legs.map((l, n) => {
    const c = l.consignment;
    return {
      seq: n + 1,
      consignmentRef: c.ref,
      jobNumber: c.jobNumber,
      customer: c.customerName,
      consignee: c.delivery.name,
      toPostcode: c.delivery.country === "CZ" ? showPostcode(c.delivery.postcode) : c.delivery.postcode,
      toCity: c.delivery.city,
      pieces: c.load.pieces,
      palletPlaces: c.load.palletPlaces,
      ldm: c.load.ldm,
      weightKg: c.load.weightKg,
      adr: adrText(c.load),
      notes: legNotes(c, i.language),
    };
  });
  const label = TRIP_KIND_LABEL[i.trip.kind];
  return {
    language: i.language,
    tripRef: i.trip.ref,
    tripKindLabel: say(i.language, label.cs, label.en),
    date: i.trip.plannedPickupDate,
    ourCompany: i.ourCompany,
    haulier: i.haulier,
    vehicleText: vehicleText(i.vehicle?.label ?? null, i.vehicle?.tailLift ?? false, i.language),
    plates: platesText(i.trip.tractorPlate, i.trip.trailerPlate),
    driver: joinNonEmpty([i.trip.driverName, i.trip.driverPhone]),
    from: docStop(ends.from),
    to: ends.to ? docStop(ends.to) : null,
    rows,
    totals: totalsOf(i.legs.map((l) => l.consignment.load)),
    capacityText: capacityText(i.capacity, i.fill),
  };
}

/** The piece labels of consignments: one per piece ("n / N"), or one per consignment. */
export function labelDocs(
  consignments: (DocConsignment & { serviceLabel: string; zoneLabel: string })[],
  perPiece: boolean,
): LabelDoc[] {
  return consignments.flatMap((c): LabelDoc[] => {
    const count = Math.max(1, Math.round(c.load.pieces));
    const base = {
      consignmentRef: c.ref,
      jobNumber: c.jobNumber,
      pieceCount: count,
      sender: c.pickup.name,
      consignee: c.delivery.name,
      toStreet: c.delivery.street,
      toPostcode: c.delivery.country === "CZ" ? showPostcode(c.delivery.postcode) : c.delivery.postcode,
      toCity: c.delivery.city,
      zoneLabel: c.zoneLabel,
      serviceLabel: c.serviceLabel,
      adr: c.load.adr,
      tailLift: c.load.tailLift,
      weightKg: c.load.weightKg,
    };
    return perPiece ? Array.from({ length: count }, (_, n) => ({ ...base, pieceNo: n + 1 })) : [{ ...base, pieceNo: null }];
  });
}

export interface LtlTransportOrderInput extends Omit<ManifestInput, "capacity" | "fill"> {
  issuedAt: Date;
  paymentDays: number;
  pickupPin: string | null;
  /** No PIN: the order says the dispatcher gives it (the haulier portal's copy) */
  pinAsGiven?: boolean;
  podLink: string | null;
}

/**
 * The transport order of an LTL trip: the single pick-up / delivery describe where the trip
 * starts and ends, and every leg is a stop (a pick-up run's pick-ups, a delivery run's
 * deliveries, a line haul's drop at the depot).
 */
export function ltlTransportOrderDoc(i: LtlTransportOrderInput): LtlTransportOrderDoc {
  const hub = hubStop(i.hub);
  const ends = tripEnds(i.trip.kind, i.legs, hub);
  const loads = i.legs.map((l) => l.consignment.load);
  const refs = i.legs.map((l) => l.consignment.ref);
  const jobs = [...new Set(i.legs.map((l) => l.consignment.jobNumber))];
  const load = summedLoad(loads, say(i.language, `Sběrná zásilka, ${refs.length} zásilek`, `Groupage, ${refs.length} consignment${refs.length === 1 ? "" : "s"}`));
  const base = transportOrderDoc({
    language: i.language,
    issuedAt: i.issuedAt,
    ourCompany: i.ourCompany,
    haulier: i.haulier,
    paymentDays: i.paymentDays,
    trip: i.trip,
    vehicle: i.vehicle,
    consignment: { ref: refs.join(", "), jobNumber: jobs.join(", "), pickup: ends.from, delivery: ends.to ?? ends.from, load: loads[0] ?? emptyLoad },
    pickupPin: i.pickupPin,
    pinAsGiven: i.pinAsGiven,
    podLink: i.podLink,
  });
  const stops: TransportOrderStop[] = i.legs.map((l) => {
    const c = l.consignment;
    const at = l.kind === "PICKUP" ? c.pickup : l.kind === "LINEHAUL" ? depotStop(l.toText, l.toPostcode) : c.delivery;
    return { ...docStop(at), kind: l.kind === "PICKUP" ? "PICKUP" : "DELIVERY", consignmentRef: c.ref, load: docLoad(c.load) };
  });
  return {
    ...base,
    delivery: docStop(ends.to ?? hub),
    load,
    terms: transportOrderTerms(i.language, { adr: load.adr, paymentDays: i.paymentDays, pinPrinted: !!i.pickupPin }),
    stops,
    totals: totalsOf(loads),
  };
}

const emptyLoad: LoadInput = {
  pieces: 0,
  palletPlaces: 0,
  ldm: 0,
  weightKg: 0,
  cbm: 0,
  adr: false,
  adrUn: "",
  adrClass: "",
  adrPackingGroup: "",
  nonStackable: false,
  tailLift: false,
  b2c: false,
  description: "",
};
