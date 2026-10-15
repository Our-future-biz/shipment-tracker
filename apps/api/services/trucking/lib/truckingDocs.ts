import { showPostcode, fmt } from "./rateEngine";
import { formatDay } from "./format";
import type { CmrDoc, DocLanguage, DocLoad, DocParty, DocStop, TransportOrderDoc } from "./documentTypes";
import type { LoadInput, PriceSnapshot, StopInput } from "../interfaces/interfaces";

// The transport order and the CMR as plain data (lib/documentTypes.ts), built from a trip, its
// consignment and the parties. Pure, so every printed line has its test; the PDF builders
// (transportOrderPdf.ts, cmrPdf.ts) only lay them out. The Pick-up PIN is passed through to the
// document and nowhere else.

/** Our company as printed when no company details are saved yet. */
export const EMPTY_PARTY: DocParty = { name: "", street: "", postcode: "", city: "", country: "CZ", ico: "", dic: "", contact: "" };

/** A text in the document's language: Czech, English, or both ("Czech / English"). */
export const say = (language: DocLanguage, cs: string, en: string): string => (language === "cs" ? cs : language === "en" ? en : `${cs} / ${en}`);

const pragueTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const pragueDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date(iso));

/** "16 Oct 2026, 08:00–12:00", "16 Oct 2026, from 08:00", "" when there is no window. */
export function windowText(from: string | null, to: string | null): string {
  if (!from && !to) return "";
  if (from && to) {
    const sameDay = pragueDay(from) === pragueDay(to);
    return sameDay
      ? `${formatDay(pragueDay(from))}, ${pragueTime(from)}–${pragueTime(to)}`
      : `${formatDay(pragueDay(from))} ${pragueTime(from)} – ${formatDay(pragueDay(to))} ${pragueTime(to)}`;
  }
  return from ? `${formatDay(pragueDay(from))}, from ${pragueTime(from)}` : `${formatDay(pragueDay(to!))}, by ${pragueTime(to!)}`;
}

const joinNonEmpty = (parts: (string | null | undefined)[], sep = ", ") => parts.map((p) => (p ?? "").trim()).filter(Boolean).join(sep);

/** A CZ postcode as printed ("110 00"); others as stored. */
const printedPostcode = (postcode: string, country: string) => (country === "CZ" ? showPostcode(postcode) : postcode);

export function docStop(s: StopInput): DocStop {
  return {
    name: s.name,
    street: s.street,
    postcode: printedPostcode(s.postcode, s.country),
    city: s.city,
    country: s.country,
    windowText: windowText(s.windowFrom, s.windowTo),
    contact: joinNonEmpty([s.contactName, s.contactPhone]),
    reference: s.reference,
    notes: s.notes,
    avizaceRequired: s.avizaceRequired,
  };
}

/** A stop as a party of the CMR (sender / consignee): its name and address, no IČO. */
export function stopParty(s: StopInput): DocParty {
  return {
    name: s.name,
    street: s.street,
    postcode: printedPostcode(s.postcode, s.country),
    city: s.city,
    country: s.country,
    ico: "",
    dic: "",
    contact: joinNonEmpty([s.contactName, s.contactPhone]),
  };
}

export function docLoad(l: LoadInput): DocLoad {
  return {
    pieces: l.pieces,
    palletPlaces: l.palletPlaces,
    ldm: l.ldm,
    weightKg: l.weightKg,
    cbm: l.cbm,
    description: l.description,
    nonStackable: l.nonStackable,
    tailLift: l.tailLift,
    adr: l.adr ? { un: l.adrUn, className: l.adrClass, packingGroup: l.adrPackingGroup } : null,
  };
}

/** "1AB2345 / 2CD6789", one of them, or "". */
export const platesText = (tractor: string, trailer: string) => joinNonEmpty([tractor, trailer], " / ");

/** What we pay the haulier: "30 days after invoice with original POD" in the document's language. */
export const paymentTermsText = (language: DocLanguage, days: number) =>
  say(language, `${days} dní od doručení faktury s originálem POD (potvrzeného CMR)`, `${days} days after invoice with original POD (signed CMR)`);

/**
 * The numbered conditions printed at the end of a transport order: the SSL general terms, our
 * liability as a forwarder and the carrier's, the ADR duty when the goods are dangerous, POD and
 * payment, confidentiality, and the PIN's secrecy when one is printed.
 */
export function transportOrderTerms(language: DocLanguage, o: { adr: DocLoad["adr"]; paymentDays: number; pinPrinted: boolean }): string[] {
  const terms = [
    say(
      language,
      "Objednávka se řídí Všeobecnými podmínkami Svazu spedice a logistiky České republiky (SSL) v platném znění; dopravce je přijímá potvrzením objednávky.",
      "This order is governed by the General Terms and Conditions of the Association of Forwarding and Logistics of the Czech Republic (SSL), current version; the carrier accepts them by confirming the order.",
    ),
    say(
      language,
      "Jednáme jako zasílatel podle § 2471 a násl. zákona č. 89/2012 Sb., občanský zákoník. Dopravce odpovídá za zásilku od jejího převzetí do vydání příjemci podle § 2555 a násl. občanského zákoníku, u mezinárodní přepravy podle Úmluvy CMR.",
      "We act as a freight forwarder under Section 2471 et seq. of Act No. 89/2012 Coll., the Czech Civil Code. The carrier is liable for the goods from taking them over until delivery to the consignee under Section 2555 et seq. of the Civil Code, and under the CMR Convention for international carriage.",
    ),
  ];
  if (o.adr) {
    const goods = joinNonEmpty([`UN ${o.adr.un}`, o.adr.className ? `class ${o.adr.className}` : "", o.adr.packingGroup ? `PG ${o.adr.packingGroup}` : ""]);
    const zbozi = joinNonEmpty([`UN ${o.adr.un}`, o.adr.className ? `třída ${o.adr.className}` : "", o.adr.packingGroup ? `obalová skupina ${o.adr.packingGroup}` : ""]);
    terms.push(
      say(
        language,
        `Zásilka je nebezpečná věc podle ADR (${zbozi}). Dopravce zajistí vozidlo vybavené podle ADR a řidiče s platným osvědčením ADR a veze předepsané doklady.`,
        `The goods are dangerous goods under ADR (${goods}). The carrier provides an ADR-equipped vehicle and a driver with a valid ADR certificate, and carries the required documents.`,
      ),
    );
  }
  terms.push(
    say(
      language,
      `Dopravce doloží doručení podepsaným dokladem (POD / CMR) a nahraje jej přes odkaz v této objednávce. Platba: ${paymentTermsText("cs", o.paymentDays)}.`,
      `The carrier proves delivery with a signed POD / CMR and uploads it through the link in this order. Payment: ${paymentTermsText("en", o.paymentDays)}.`,
    ),
    say(
      language,
      "Objednávka, cena a údaje o zákazníkovi jsou důvěrné. Dopravce nesmí přepravu dále postoupit ani jednat přímo s naším zákazníkem bez našeho písemného souhlasu.",
      "This order, its price and the customer's details are confidential. The carrier may not subcontract the carriage or deal directly with our customer without our written consent.",
    ),
  );
  if (o.pinPrinted) {
    terms.push(
      say(language, "PIN pro vyzvednutí je důvěrný: řidič jej sdělí pouze při nakládce.", "The Pick-up PIN is confidential: the driver gives it only at loading."),
    );
  }
  return terms;
}

/** "Agreed price" or "Tariff Bravo 2026 v3", with "excl. VAT". */
export function agreedPriceOf(buy: PriceSnapshot | null, language: DocLanguage): TransportOrderDoc["agreedPrice"] {
  if (!buy) return null;
  const basis = buy.source === "MANUAL" ? say(language, "Sjednaná cena", "Agreed price") : say(language, `Dle tarifu ${buy.tariffName}`, `Per tariff ${buy.tariffName}`);
  return { total: buy.total, currency: buy.currency, note: `${basis}, ${say(language, "bez DPH", "excl. VAT")}` };
}

/** "Tautliner 13.6 m, tail lift" from the vehicle type's label, or "". */
export const vehicleText = (label: string | null, tailLift: boolean, language: DocLanguage) =>
  joinNonEmpty([label ?? "", label && tailLift ? say(language, "čelo", "tail lift") : ""]);

export interface TransportOrderInput {
  language: DocLanguage;
  issuedAt: Date;
  ourCompany: DocParty;
  haulier: DocParty;
  paymentDays: number;
  trip: {
    ref: string;
    plannedPickupDate: string;
    tractorPlate: string;
    trailerPlate: string;
    driverName: string;
    driverPhone: string;
    buy: PriceSnapshot | null;
  };
  vehicle: { label: string; tailLift: boolean } | null;
  consignment: { ref: string; jobNumber: string; pickup: StopInput; delivery: StopInput; load: LoadInput };
  /** Typed by the user for this print; printed only */
  pickupPin: string | null;
  /** No PIN: the order says the dispatcher gives it (the haulier portal's copy) */
  pinAsGiven?: boolean;
  podLink: string | null;
}

export function transportOrderDoc(i: TransportOrderInput): TransportOrderDoc {
  const load = docLoad(i.consignment.load);
  return {
    language: i.language,
    orderNumber: i.trip.ref,
    issuedAt: i.issuedAt.toISOString(),
    ourCompany: i.ourCompany,
    haulier: i.haulier,
    consignmentRef: i.consignment.ref,
    jobNumber: i.consignment.jobNumber,
    plannedPickupDate: i.trip.plannedPickupDate,
    pickup: docStop(i.consignment.pickup),
    delivery: docStop(i.consignment.delivery),
    load,
    vehicleText: vehicleText(i.vehicle?.label ?? null, i.vehicle?.tailLift ?? false, i.language),
    plates: platesText(i.trip.tractorPlate, i.trip.trailerPlate),
    driver: joinNonEmpty([i.trip.driverName, i.trip.driverPhone]),
    agreedPrice: agreedPriceOf(i.trip.buy, i.language),
    paymentTerms: paymentTermsText(i.language, i.paymentDays),
    pickupPin: i.pickupPin,
    pinAsGiven: !i.pickupPin && !!i.pinAsGiven,
    podLink: i.podLink,
    terms: transportOrderTerms(i.language, { adr: load.adr, paymentDays: i.paymentDays, pinPrinted: !!i.pickupPin }),
  };
}

export interface CmrInput {
  issuedAt: Date;
  carrier: DocParty | null;
  plates: string;
  consignment: { ref: string; jobNumber: string; pickup: StopInput; delivery: StopInput; load: LoadInput };
}

/** The consignment note: sender and consignee are the pick-up and delivery places. Printed in both languages. */
export function cmrDoc(i: CmrInput): CmrDoc {
  const c = i.consignment;
  const load = docLoad(c.load);
  const instructions = joinNonEmpty(
    [
      c.delivery.avizaceRequired ? "Avizace před doručením / Call the consignee before delivery" : "",
      load.nonStackable ? "Nestohovat / Do not stack" : "",
      load.tailLift ? "Vozidlo s čelem / Tail lift needed" : "",
      c.pickup.notes,
      c.delivery.notes,
    ],
    ". ",
  );
  return {
    language: "both",
    consignmentRef: c.ref,
    jobNumber: c.jobNumber,
    issuedAt: i.issuedAt.toISOString(),
    sender: stopParty(c.pickup),
    consignee: stopParty(c.delivery),
    carrier: i.carrier,
    placeOfTakingOver: docStop(c.pickup),
    placeOfDelivery: docStop(c.delivery),
    load,
    documentsAttached: load.adr ? "Přepravní doklad ADR / ADR transport document" : "",
    instructions,
    plates: i.plates,
  };
}

/** "32 pallets, 13.6 ldm, 24 000 kg" for event lines and the history. */
export const loadSummary = (l: LoadInput) =>
  joinNonEmpty([l.palletPlaces ? `${fmt(l.palletPlaces)} pallets` : "", l.ldm ? `${fmt(l.ldm)} ldm` : "", l.weightKg ? `${fmt(l.weightKg)} kg` : ""]);
