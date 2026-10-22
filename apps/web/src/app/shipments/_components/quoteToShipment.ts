// Maps a sales quote's data blob onto a new shipment: create-request fields and
// cargo lines (the quote's container lines become container rows, its package
// lines cargo_dimension rows, the commodity a cargo_item row). The quote's cost lines are not mapped
// here: the server copies them into Costs Breakdown, one row per line, when it
// creates the shipment from the quote.
// The same mapping read the other way round is at the end: what a quote takes
// from a shipment ("Copy from shipment").

import { computeCargo, computeTotals, quoteCurrency } from "@/app/sales/_lib/salesQuote";
import { DIRECTIONS, type PackageLine, type QuoteContainerLine, type SalesQuoteData } from "@/app/sales/_lib/types";
import type { controllers, interfaces } from "@/lib/api/client";
import { num } from "@/lib/cargo";
import type { ExchangeRates } from "@/lib/exchangeRates";
import { fmtMoney } from "@/lib/money";

const s = (v: unknown): string => (v == null || v === 0 ? "" : String(v));
const isIsoDate = (v: string | null | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Quote package types differ slightly from the cargo dictionary ("Pallets" vs
// "Pallet(s)"); map the known mismatch, keep everything else verbatim.
const packageType = (t: string | undefined): string => (t === "Pallets" ? "Pallet(s)" : (t ?? ""));

const FREIGHT_MODE: Record<string, string> = {
  Air: "Air Freight",
  "Sea FCL": "Sea Freight",
  "Sea LCL": "Sea Freight",
  Rail: "Rail Freight",
  Road: "Road Freight",
};
const LOAD_TYPE: Record<string, string> = {
  "Sea FCL": "Full Load",
  "Sea LCL": "Consolidation",
};

// `sheet` is the current Exchange sheet, which the quote's totals are converted with where the
// quote stores no rate of its own.
export function quoteToCreateRequest(quoteNumber: string, data: SalesQuoteData, sheet: ExchangeRates): Partial<controllers.ShipmentCreateRequest> {
  // Created from the quote: the server makes it the shipment's Sales Number and its owner the
  // Sales Person, links the quote and marks it Won, and copies its cost lines.
  const out: Partial<controllers.ShipmentCreateRequest> = { fromQuoteNumber: quoteNumber };
  const set = (key: keyof controllers.ShipmentCreateRequest, value: string) => {
    if (value) (out as Record<string, string>)[key] = value;
  };

  set("customer", data.customerName ?? "");
  set("customerId", data.customerId ?? "");
  set("customerPic", data.customerContact ?? "");

  // Direction drives the default status suffix ([IMP]/[EXP]).
  const direction = data.direction === "Export" ? "Export" : data.direction === "Import" ? "Import" : "";
  set("tradeDirection", direction);
  if (direction) {
    set("status", direction === "Export" ? "Booking Confirmation Pending [EXP]" : "Booking Confirmation Pending [IMP]");
  }
  set("freightMode", FREIGHT_MODE[data.serviceType ?? ""] ?? "");
  set("loadType", LOAD_TYPE[data.serviceType ?? ""] ?? "");
  set("incotermOrigin", data.incoterm ?? "");

  // The ports the quote names; a quote from before POL / POD has only its origin and destination.
  set("pol", data.pol || data.origin || "");
  set("pod", data.pod || data.destination || "");
  set("pickupAddress", data.pickup ?? "");
  set("deliveryAddress", data.delivery ?? "");
  if (isIsoDate(data.readyDate)) set("cargoReadinessDate", data.readyDate);

  // Quote block
  set("quoteValidity", data.validUntil ?? "");
  if (isIsoDate(data.validUntil)) {
    set("validityStatus", data.validUntil >= new Date().toISOString().slice(0, 10) ? "Ok" : "Check");
  }
  // The shipment's own selling and buying are one figure each: the quote's totals, converted
  // into the quote's currency. A total that leaves a line out for want of an exchange rate is
  // not sent at all - amounts in different currencies are never added up as they stand.
  const totals = computeTotals(data, sheet);
  if (totals.selling && !totals.missingSellingRates.length) set("selling", totals.selling.toFixed(2));
  if (totals.buying && !totals.missingBuyingRates.length) set("buying", totals.buying.toFixed(2));

  // Containers: one row per box of the type the quote names. Their numbers and seals come with
  // the booking; the cargo weight the quote declares per box goes with each row.
  const containers: interfaces.ContainerLine[] = (data.containers ?? []).flatMap((c) =>
    Array.from({ length: Math.max(0, Math.floor(Number(c.qty) || 0)) }, () => ({
      containerNumber: "",
      sealNumber: "",
      type: c.type ?? "",
      teu: "",
      packages: "",
      packageType: "",
      grossWeight: s(c.weight),
      volume: "",
    })),
  );
  if (containers.length > 0) out.containers = containers;

  // Cargo: package lines → dimension rows; the commodity → one cargo item.
  const packages = data.packages ?? [];
  const dimensions: interfaces.CargoDimensionLine[] = packages
    .filter((p) => p.qty || p.length || p.width || p.height || p.weight)
    .map((p) => ({
      containerId: null,
      pieces: s(p.qty),
      lengthCm: s(p.length),
      widthCm: s(p.width),
      heightCm: s(p.height),
      weightPerPcKg: s(p.weight),
      packageType: packageType(p.type),
      stackable: p.stackable === true ? "Stackable" : p.stackable === false ? "Non-stackable" : "",
    }));
  if (dimensions.length > 0) out.cargoDimensions = dimensions;

  const totalPieces = packages.reduce((t, p) => t + (Number(p.qty) || 0), 0);
  const totalWeight = packages.reduce((t, p) => t + (Number(p.qty) || 0) * (Number(p.weight) || 0), 0);
  if (data.commodity || totalPieces) {
    out.cargoItems = [
      {
        containerId: null,
        cargoDescription: data.commodity ?? "",
        hsCode: "",
        pieces: s(totalPieces),
        packageType: packageType(packages[0]?.type),
        grossWeight: totalWeight ? totalWeight.toFixed(2) : "",
        commercialInvoiceValue: "",
        // A quote that stores no currency is in EUR, here as everywhere it is read.
        currency: quoteCurrency(data),
      },
    ];
  }

  // The weight and volume typed for the whole shipment go with it where the lines give none -
  // the figures the quote's screens and the printed quotation show then (computeCargo), each on
  // its own. Where the container or package lines give a figure, the shipment works it out from
  // its own rows; a stored total is what it shows when its rows carry none.
  const cargo = computeCargo(data);
  if (data.weight && !cargo.weightFromLines) set("totalWeightTons", (Number(data.weight) / 1000).toFixed(3));
  if (data.cbm && !cargo.cbmFromLines) set("totalVolumeCbm", String(data.cbm));

  return out;
}

// ── Preview shown in the wizard before creating ──

export function quotePreview(data: SalesQuoteData, sheet: ExchangeRates): { label: string; value: string }[] {
  // The cargo as the quote's own screens and the printed quotation count it (computeCargo): the
  // lines added up, and the weight and volume typed for the whole shipment where the lines give
  // none - the figures the shipment above gets as well.
  const { totalPackages: pieces, grossWeight: weight, cbm, equipment, teu } = computeCargo(data);
  // The selling lines converted into the quote's currency. Lines that cannot be converted are not
  // in the figure, and it says so: a partial total must not pass for the price.
  const totals = computeTotals(data, sheet);
  const noRate = totals.missingSellingRates.join(", ");
  const selling =
    totals.selling || noRate ? `${fmtMoney(totals.selling, totals.currency)}${noRate ? ` - without the lines that need a ${noRate} rate` : ""}` : "";

  return [
    { label: "Customer", value: data.customerName ?? "" },
    { label: "Direction", value: data.direction ?? "" },
    { label: "Service", value: data.serviceType ?? "" },
    { label: "Incoterm", value: data.incoterm ?? "" },
    { label: "POL", value: data.origin ?? "" },
    { label: "POD", value: data.destination ?? "" },
    { label: "Commodity", value: data.commodity ?? "" },
    { label: "Containers", value: equipment ? `${equipment} (${teu} TEU)` : "" },
    { label: "Packages", value: pieces ? String(pieces) : "" },
    { label: "Gross Weight", value: weight ? `${weight.toLocaleString("en-US", { maximumFractionDigits: 2 })} kg` : "" },
    { label: "Volume", value: cbm ? `${cbm.toLocaleString("en-US", { maximumFractionDigits: 3 })} m³` : "" },
    { label: "Selling Total", value: selling },
    { label: "Validity", value: data.validUntil ?? "" },
  ].filter((i) => i.value);
}

// ── The way back: what "Copy from shipment" gives a quote ──

// A shipment's words are compared without regard to case: older shipments say "IMPORT" and "SEA".
const word = (v: string | null | undefined): string => (v ?? "").trim().toLowerCase();

// A freight mode by its one word: "Sea Freight", "SEA" and "sea" are all sea.
const modeWord = (mode: string | null | undefined): string => word(mode).replace(/\s*freight$/, "");

// FREIGHT_MODE and LOAD_TYPE read backwards. Sea is two freight modes of a quote, told apart by
// the shipment's load type: a consolidation is LCL, and any other sea shipment the first of the
// two in FREIGHT_MODE, a full container.
function serviceTypeOf(freightMode: string, loadType: string): string | undefined {
  const mode = modeWord(freightMode);
  if (!mode) return undefined;
  const services = Object.keys(FREIGHT_MODE).filter((service) => modeWord(FREIGHT_MODE[service]) === mode);
  return services.find((service) => word(LOAD_TYPE[service]) === word(loadType)) ?? services[0];
}

// The cargo dictionary's "Pallet(s)" is the quote's "Pallets"; everything else is kept verbatim.
const quotePackageType = (t: string): string => (t === "Pallet(s)" ? "Pallets" : t);

// A shipment also says "overstowable" of cargo that other cargo may stand on.
const STACKABLE: Record<string, boolean> = {
  Stackable: true,
  Overstowable: true,
  "Non-stackable": false,
  "Non-overstowable": false,
};

// A total as the shipment shows it, with thousands separators: "12,500" kg, "14.5" m³.
const shownTotal = (v: string | null | undefined): number => Number((v ?? "").replace(/,/g, "")) || 0;

// What a shipment carries of a quote's fields - quoteToCreateRequest the other way round. A field
// the shipment has no value for is not in the result at all, so a copy from a shipment never
// blanks what was typed on the quote. The customer comes as the shipment knows it: its name,
// its link to the Customer Database and the contact person.
export function shipmentToQuoteData(shipment: interfaces.ShipmentItem): SalesQuoteData {
  const text = (v: string | null | undefined): string | undefined => v?.trim() || undefined;

  const customerName = text(shipment.customer);
  const customerId = shipment.customerId ?? undefined;

  // Dimension rows → package lines. Their numbers are free text and are read the way the
  // shipment's own totals read them; a row nobody filled in is no package.
  const packages: PackageLine[] = (shipment.cargoDimensions ?? [])
    .map((line) => ({
      qty: num(line.pieces),
      type: quotePackageType(line.packageType),
      length: num(line.lengthCm) || undefined,
      width: num(line.widthCm) || undefined,
      height: num(line.heightCm) || undefined,
      weight: num(line.weightPerPcKg) || undefined,
      stackable: STACKABLE[line.stackable],
    }))
    .filter((p) => p.qty || p.length || p.width || p.height || p.weight);

  // Container rows → container lines: the boxes of one type and one declared cargo weight are
  // counted together, as the quote lists them. A row without a type is no box yet.
  const boxes = new Map<string, QuoteContainerLine>();
  for (const row of shipment.containers ?? []) {
    const type = (row.type ?? "").trim();
    if (!type) continue;
    const weight = num(row.grossWeight) || undefined;
    const key = `${type}|${weight ?? ""}`;
    const line = boxes.get(key);
    if (line) line.qty += 1;
    else boxes.set(key, { qty: 1, type, weight });
  }
  const containers = [...boxes.values()];

  // Weight and volume of the whole shipment: its totals - the containers' declared figures, else
  // the cargo rows added up. A shipment without such rows has only the tons and CBM stored on it,
  // which is where a quote without package lines puts its figures.
  const weight = shownTotal(shipment.totalGrossWeightKg) || Math.round(Number(shipment.totalWeightTons) * 1e6) / 1e3 || 0;
  const cbm = shownTotal(shipment.totalVolumeM3) || Number(shipment.totalVolumeCbm) || 0;

  const carried: SalesQuoteData = {
    customerName,
    customerId,
    // The contact person of a shipment that names no customer is left there: copied alone, it
    // would stand under the name of the customer the quote already has.
    customerContact: customerName || customerId ? text(shipment.customerPic) : undefined,

    direction: DIRECTIONS.find((direction) => word(direction) === word(shipment.tradeDirection)),
    serviceType: serviceTypeOf(shipment.freightMode, shipment.loadType),
    incoterm: text(shipment.incotermOrigin),
    readyDate: isIsoDate(shipment.cargoReadinessDate) ? shipment.cargoReadinessDate : undefined,

    origin: text(shipment.pol),
    destination: text(shipment.pod),
    pol: text(shipment.pol),
    pod: text(shipment.pod),
    pickup: text(shipment.pickupAddress),
    delivery: text(shipment.deliveryAddress),

    // The commodity went into the first cargo item; a shipment from before cargo items has its
    // description on itself.
    commodity: text(shipment.cargoItems?.[0]?.cargoDescription) ?? text(shipment.cargoDescription),
    packages: packages.length > 0 ? packages : undefined,
    containers: containers.length > 0 ? containers : undefined,
    weight: weight || undefined,
    cbm: cbm || undefined,
  };
  return Object.fromEntries(Object.entries(carried).filter(([, value]) => value !== undefined));
}
