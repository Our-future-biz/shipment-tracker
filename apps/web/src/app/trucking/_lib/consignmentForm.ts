import type { ConsignmentCreate, ConsignmentDetail, ConsignmentUpdate, LoadInput, StopInput } from "@/hooks/useTruckingConsignments";
import type { CustomerSiteItem } from "@/hooks/useCustomerSites";
import type { ShipmentItem } from "@/hooks/useShipments";
import type { SalesQuoteData } from "@/app/sales/_lib/types";
import { isValidPsc, pscDigits } from "./hauliers";
import type { ServiceLevelCode } from "./tariffs";

// The Create / Edit consignment form: an order taken from a job, a quote or typed new, its checks
// and the request it sends. Pure (tested in consignmentForm.test.ts).

/** Where the order comes from: an existing job, a quote, or a new domestic order (a job is created). */
export type ConsignmentSource = "job" | "quote" | "new";

export const SOURCE_OPTIONS: { value: ConsignmentSource; label: string }[] = [
  { value: "job", label: "From job no." },
  { value: "quote", label: "From quote" },
  { value: "new", label: "New domestic order" },
];

export type PriceSource = "TARIFF" | "QUOTE" | "MANUAL";

export interface ConsignmentForm {
  source: ConsignmentSource;
  shipmentId: string | null;
  jobNumber: string;
  customerId: string | null;
  customerName: string | null;
  quoteNumber: string | null;
  serviceLevel: ServiceLevelCode | null;
  pickupDate: string;
  pickupTime: string | null;
  pickup: StopInput;
  delivery: StopInput;
  load: LoadInput;
  priceSource: PriceSource;
  manualTotal: number | null;
  manualCurrency: "CZK" | "EUR";
  manualReason: string;
}

export const emptyStop = (): StopInput => ({
  siteId: null,
  name: "",
  street: "",
  postcode: "",
  city: "",
  country: "CZ",
  windowFrom: null,
  windowTo: null,
  contactName: "",
  contactPhone: "",
  avizaceRequired: false,
  reference: "",
  notes: "",
});

export const emptyLoad = (): LoadInput => ({
  pieces: 1,
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
});

export const emptyConsignmentForm = (source: ConsignmentSource, today: string): ConsignmentForm => ({
  source,
  shipmentId: null,
  jobNumber: "",
  customerId: null,
  customerName: null,
  quoteNumber: null,
  serviceLevel: "D1",
  pickupDate: today,
  pickupTime: null,
  pickup: emptyStop(),
  delivery: emptyStop(),
  load: emptyLoad(),
  priceSource: "TARIFF",
  manualTotal: null,
  manualCurrency: "CZK",
  manualReason: "",
});

/** A stop filled from a customer's site: address, who to call before arriving, loading notes. */
export function stopFromSite(site: CustomerSiteItem, stop: StopInput = emptyStop()): StopInput {
  return {
    ...stop,
    siteId: site.id,
    name: site.label,
    street: site.street,
    postcode: site.country === "CZ" ? pscDigits(site.postcode) : site.postcode,
    city: site.city,
    country: site.country || "CZ",
    contactName: site.avizaceName,
    contactPhone: site.avizacePhone,
    avizaceRequired: !!site.avizaceName || !!site.avizacePhone || stop.avizaceRequired,
    notes: site.loadingNotes || stop.notes,
  };
}

/** A stop from a site the job or quote names, else from what it carries itself (postcode, address). */
function stopFrom(siteId: string | null | undefined, postcode: string | null | undefined, fallback: Partial<StopInput>, sites: readonly CustomerSiteItem[]): StopInput {
  const site = siteId ? sites.find((s) => s.id === siteId) : undefined;
  if (site) return stopFromSite(site);
  return { ...emptyStop(), ...fallback, postcode: pscDigits(postcode ?? "") };
}

/** The order of an existing job: its customer, pick-up and delivery (sites when the job names them). */
export function formFromShipment(shipment: ShipmentItem, sites: readonly CustomerSiteItem[], today: string): ConsignmentForm {
  const form = emptyConsignmentForm("job", today);
  return {
    ...form,
    shipmentId: shipment.id,
    jobNumber: shipment.jobNumber,
    customerId: shipment.customerId,
    customerName: shipment.customer || null,
    pickupDate: /^\d{4}-\d{2}-\d{2}$/.test(shipment.pickupDate ?? "") ? shipment.pickupDate! : today,
    pickup: stopFrom(shipment.pickupSiteId, shipment.pickupPostcode, { name: shipment.shipper, street: shipment.pickupAddress, country: shipment.pickupCountry || "CZ" }, sites),
    delivery: stopFrom(shipment.deliverySiteId, shipment.deliveryPostcode, { name: shipment.consignee, street: shipment.deliveryAddress, country: shipment.deliveryCountry || "CZ" }, sites),
  };
}

/** The order of a quote's road transport: customer, sites or postcodes, date, what is carried and the level priced. */
export function formFromQuote(quoteNumber: string, data: SalesQuoteData, sites: readonly CustomerSiteItem[], today: string): ConsignmentForm {
  const form = emptyConsignmentForm("quote", today);
  const road = data.road;
  return {
    ...form,
    customerId: data.customerId ?? null,
    customerName: data.customerName ?? null,
    quoteNumber,
    serviceLevel: data.roadPricing?.serviceLevel ?? form.serviceLevel,
    pickupDate: road?.pickupDate && road.pickupDate >= today ? road.pickupDate : today,
    pickupTime: road?.pickupTime ?? null,
    pickup: stopFrom(road?.fromSiteId, road?.fromPostcode, {}, sites),
    delivery: stopFrom(road?.toSiteId, road?.toPostcode, {}, sites),
    load: road
      ? {
          ...form.load,
          pieces: road.pieces,
          palletPlaces: road.palletPlaces,
          ldm: road.ldm,
          weightKg: road.weightKg,
          cbm: road.cbm,
          adr: road.extras.adr,
          nonStackable: road.extras.nonStackable,
          tailLift: road.extras.tailLift,
          b2c: road.extras.b2c,
        }
      : form.load,
    // A quote priced from the tariff is booked at that price.
    priceSource: data.roadPricing ? "QUOTE" : "TARIFF",
  };
}

/** The form of a stored consignment, for Edit. */
export function formFromDetail(c: ConsignmentDetail): ConsignmentForm {
  const strip = ({ siteId, name, street, postcode, city, country, windowFrom, windowTo, contactName, contactPhone, avizaceRequired, reference, notes }: StopInput): StopInput => ({
    siteId,
    name,
    street,
    postcode,
    city,
    country,
    windowFrom,
    windowTo,
    contactName,
    contactPhone,
    avizaceRequired,
    reference,
    notes,
  });
  const sell = c.sell;
  return {
    source: "job",
    shipmentId: c.shipmentId,
    jobNumber: c.jobNumber,
    customerId: c.customerId,
    customerName: c.customerName,
    quoteNumber: c.quoteNumber,
    serviceLevel: c.serviceLevel,
    pickupDate: c.pickupDate,
    pickupTime: null,
    pickup: strip(c.pickup),
    delivery: strip(c.delivery),
    load: { ...c.load },
    priceSource: sell?.source ?? "TARIFF",
    manualTotal: sell?.source === "MANUAL" ? sell.total : null,
    manualCurrency: sell?.currency ?? "CZK",
    manualReason: sell?.overrideReason ?? "",
  };
}

const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const notNegative = (n: number) => Number.isFinite(n) && n >= 0;

function stopProblems(label: string, s: StopInput): string[] {
  const out: string[] = [];
  if (!s.name.trim()) out.push(`${label}: name of the company or site`);
  if (!s.city.trim()) out.push(`${label}: city`);
  if (s.country === "CZ" && !isValidPsc(s.postcode)) out.push(`${label}: postcode (PSČ) has 5 digits`);
  if (s.country !== "CZ" && !s.postcode.trim()) out.push(`${label}: postcode`);
  if (s.windowFrom && s.windowTo && s.windowFrom > s.windowTo) out.push(`${label}: the time window ends before it starts`);
  if (s.avizaceRequired && !s.contactPhone.trim()) out.push(`${label}: a phone for the avizace`);
  return out;
}

/** Why the order cannot be saved yet, one line per problem. */
export function consignmentFormProblems(f: ConsignmentForm): string[] {
  const out: string[] = [];
  if (f.source === "job" && !f.shipmentId) out.push("Pick the job");
  if (f.source === "quote" && !f.quoteNumber) out.push("Pick the quote");
  if (!f.customerId) out.push(f.source === "job" ? "The job has no customer from the Customer Database — set it in Shipments first" : "Pick the customer");
  if (!f.serviceLevel) out.push("Choose the service level");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.pickupDate)) out.push("Pick-up date is required");
  if (f.pickupTime != null && !isTime(f.pickupTime)) out.push("Pick-up time must be HH:MM");
  out.push(...stopProblems("Pick-up", f.pickup), ...stopProblems("Delivery", f.delivery));
  const l = f.load;
  if (![l.pieces, l.palletPlaces, l.ldm, l.weightKg, l.cbm].every(notNegative)) out.push("Quantities cannot be negative");
  if (l.weightKg <= 0) out.push("Weight (kg) is required");
  if (l.adr && !/^\d{4}$/.test(l.adrUn.trim())) out.push("ADR: the UN number has 4 digits");
  if (l.adr && !l.adrClass.trim()) out.push("ADR: the class");
  if (f.priceSource === "QUOTE" && !f.quoteNumber) out.push("A price from the quote needs the quote");
  if (f.priceSource === "MANUAL") {
    if (f.manualTotal == null || !(f.manualTotal > 0)) out.push("Agreed price: the total");
    if (f.manualReason.trim().length < 3) out.push("Agreed price: why the tariff is not used");
  }
  return out;
}

/** The price the request carries. */
function priceOf(f: ConsignmentForm): ConsignmentCreate["price"] {
  if (f.priceSource === "MANUAL") return { source: "MANUAL", total: f.manualTotal ?? 0, currency: f.manualCurrency, reason: f.manualReason.trim() };
  return { source: f.priceSource };
}

const trimStop = (s: StopInput): StopInput => ({ ...s, name: s.name.trim(), street: s.street.trim(), city: s.city.trim(), postcode: s.country === "CZ" ? pscDigits(s.postcode) : s.postcode.trim() });

/** The create request; call only when consignmentFormProblems is empty. A new domestic order has no job yet. */
export function toCreateRequest(f: ConsignmentForm): ConsignmentCreate {
  return {
    shipmentId: f.source === "new" ? null : f.shipmentId,
    customerId: f.customerId ?? "",
    quoteNumber: f.quoteNumber,
    serviceLevel: f.serviceLevel ?? "D1",
    pickupDate: f.pickupDate,
    pickupTime: f.pickupTime,
    pickup: trimStop(f.pickup),
    delivery: trimStop(f.delivery),
    load: f.load,
    price: priceOf(f),
  };
}

/** The update request with the version read; `reprice` prices again from the tariff or quote. */
export function toUpdateRequest(f: ConsignmentForm, version: number, reprice: boolean): ConsignmentUpdate {
  const c = toCreateRequest(f);
  return {
    quoteNumber: c.quoteNumber,
    serviceLevel: c.serviceLevel,
    pickupDate: c.pickupDate,
    pickupTime: c.pickupTime,
    pickup: c.pickup,
    delivery: c.delivery,
    load: c.load,
    price: c.price,
    version,
    reprice,
  };
}
