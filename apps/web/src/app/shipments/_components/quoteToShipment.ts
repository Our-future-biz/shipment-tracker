// Maps a sales quote's data blob onto a new shipment: create-request fields,
// cargo lines (the quote's package lines become cargo_dimension rows, the
// commodity becomes a cargo_item row), and the invoicing estimated-cost plan.

import type { SalesQuoteData, CostLine } from "@/app/sales/_lib/types";
import type { controllers, interfaces } from "@/lib/api/client";

const s = (v: unknown): string => (v == null || v === 0 ? "" : String(v));
const isIsoDate = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

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

export function quoteToCreateRequest(quoteNumber: string, data: SalesQuoteData): Partial<controllers.ShipmentCreateRequest> {
  const out: Partial<controllers.ShipmentCreateRequest> = {};
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

  set("pol", data.origin ?? "");
  set("pod", data.destination ?? "");
  set("pickupAddress", data.pickup ?? "");
  set("deliveryAddress", data.delivery ?? "");
  if (isIsoDate(data.readyDate)) set("cargoReadinessDate", data.readyDate);

  // Quote block
  set("salesNumber", quoteNumber);
  set("salesPerson", data.salesOwner ?? "");
  set("quoteValidity", data.validUntil ?? "");
  if (isIsoDate(data.validUntil)) {
    set("validityStatus", data.validUntil >= new Date().toISOString().slice(0, 10) ? "Ok" : "Check");
  }
  const sum = (lines: CostLine[] | undefined) => (lines ?? []).reduce((t, l) => t + (Number(l.amount) || 0), 0);
  const selling = sum(data.sellingLines);
  const buying = sum(data.buyingLines);
  if (selling) set("selling", selling.toFixed(2));
  if (buying) set("buying", buying.toFixed(2));

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
        currency: data.currency || "USD",
      },
    ];
  }

  // Quote-level weight/volume only matter when there are no package lines to
  // derive them from (the projections handle the rest).
  if (dimensions.length === 0) {
    if (data.weight) set("totalWeightTons", (Number(data.weight) / 1000).toFixed(3));
    if (data.cbm) set("totalVolumeCbm", String(data.cbm));
  }

  return out;
}

// ── Invoicing estimated costs ──
// The invoicing tab has one row per fixed category; quote cost lines aggregate
// into them. A line whose currency differs from what its category already holds
// can't be summed — it becomes an additional charge instead.

const COST_CATEGORY: Record<string, string> = {
  "Ocean freight": "freight",
  "Air freight": "freight",
  "Rail freight": "freight",
  "Road freight": "freight",
  Pickup: "collection",
  Delivery: "collection",
  "THC Origin": "locals",
  "THC Destination": "locals",
  Handling: "locals",
  Storage: "locals",
  Demurrage: "locals",
  "Customs clearance": "customs",
  Insurance: "insurance",
};

export interface QuoteCostPlan {
  costs: { category: string; estAmount: string; estCurrency: string }[];
  charges: { description: string; estAmount: string; estCurrency: string }[];
}

export function quoteCostPlan(data: SalesQuoteData): QuoteCostPlan {
  const fallbackCurrency = data.currency || "CZK";
  const byCategory = new Map<string, { currency: string; amount: number }>();
  const charges: QuoteCostPlan["charges"] = [];

  for (const line of data.buyingLines ?? []) {
    const amount = Number(line.amount) || 0;
    if (!amount) continue;
    const category = COST_CATEGORY[line.type] ?? "others";
    const currency = line.currency || fallbackCurrency;
    const existing = byCategory.get(category);
    if (!existing) {
      byCategory.set(category, { currency, amount });
    } else if (existing.currency === currency) {
      existing.amount += amount;
    } else {
      charges.push({
        description: line.description ? `${line.type} — ${line.description}` : line.type,
        estAmount: amount.toFixed(2),
        estCurrency: currency,
      });
    }
  }

  return {
    costs: [...byCategory.entries()].map(([category, { currency, amount }]) => ({
      category,
      estAmount: amount.toFixed(2),
      estCurrency: currency,
    })),
    charges,
  };
}

// ── Preview shown in the wizard before creating ──

export function quotePreview(data: SalesQuoteData): { label: string; value: string }[] {
  const packages = data.packages ?? [];
  const pieces = packages.reduce((t, p) => t + (Number(p.qty) || 0), 0);
  const weight = packages.reduce((t, p) => t + (Number(p.qty) || 0) * (Number(p.weight) || 0), 0) || Number(data.weight) || 0;
  const cbm =
    packages.reduce((t, p) => t + ((Number(p.qty) || 0) * (Number(p.length) || 0) * (Number(p.width) || 0) * (Number(p.height) || 0)) / 1e6, 0) ||
    Number(data.cbm) ||
    0;
  const selling = (data.sellingLines ?? []).reduce((t, l) => t + (Number(l.amount) || 0), 0);

  return [
    { label: "Customer", value: data.customerName ?? "" },
    { label: "Direction", value: data.direction ?? "" },
    { label: "Service", value: data.serviceType ?? "" },
    { label: "Incoterm", value: data.incoterm ?? "" },
    { label: "POL", value: data.origin ?? "" },
    { label: "POD", value: data.destination ?? "" },
    { label: "Commodity", value: data.commodity ?? "" },
    { label: "Packages", value: pieces ? String(pieces) : "" },
    { label: "Gross Weight", value: weight ? `${weight.toLocaleString("en-US", { maximumFractionDigits: 2 })} kg` : "" },
    { label: "Volume", value: cbm ? `${cbm.toLocaleString("en-US", { maximumFractionDigits: 3 })} m³` : "" },
    { label: "Selling Total", value: selling ? `${selling.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${data.currency ?? ""}`.trim() : "" },
    { label: "Validity", value: data.validUntil ?? "" },
  ].filter((i) => i.value);
}
