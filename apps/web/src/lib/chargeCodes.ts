// The ONE catalogue of charge codes: what a cost or a selling line is for. Costs Breakdown,
// sales quotes, document reading, master jobs and invoicing all store the code and show the
// label. The twin of CHARGE_CODES in apps/api/lib/chargeCodes.ts - an API test compares the
// two, so a code is added in both or in neither.
// The charges offered are those of the Freight Charges Overview, sheet by sheet: each names the
// freight modes it is for, and a charge for every mode (Customs Clearance) names none.

/** The coarse groups of the older per-category costs (Freight, Locals, ...). */
export type ChargeGroup = "freight" | "collection" | "locals" | "customs" | "insurance" | "others";

/** The side of Costs Breakdown a charge is usually on. */
export type ChargeSide = "buy" | "sell" | "both";

/** A quote's freight modes (SERVICE_TYPES in the Sales types), which the charges are listed by. */
export type ChargeMode = "Air" | "Sea FCL" | "Sea LCL" | "Sea Break Bulk" | "Rail" | "Road";

export interface ChargeCodeEntry {
  code: string;
  label: string;
  group: ChargeGroup;
  side: ChargeSide;
  /** The freight modes the charge is offered for; without them, every mode. */
  modes?: readonly ChargeMode[];
  /** A code of the older catalogue or per-category costs: still shown, no longer offered. */
  legacy?: boolean;
}

export const CHARGE_CODES: readonly ChargeCodeEntry[] = [
  // Sea Freight FCL (Ocean freight and two charges are also LCL's, Ocean freight Break Bulk's)
  { code: "ocean_freight", label: "Ocean freight (OF / BAS)", group: "freight", side: "both", modes: ["Sea FCL", "Sea LCL", "Sea Break Bulk"] },
  { code: "fcl_baf", label: "Bunker adjustment factor (BAF)", group: "freight", side: "both", modes: ["Sea FCL"] },
  { code: "fcl_thc_origin", label: "Origin terminal handling (OTHC / OHC)", group: "locals", side: "both", modes: ["Sea FCL"] },
  { code: "fcl_thc_destination", label: "Destination terminal handling (DTHC / DHC)", group: "locals", side: "both", modes: ["Sea FCL"] },
  { code: "fcl_documentation", label: "Bill of lading / documentation fee (B/L / DOC)", group: "locals", side: "both", modes: ["Sea FCL"] },
  { code: "fcl_delivery_order", label: "Delivery order / cargo release fee (DO)", group: "locals", side: "both", modes: ["Sea FCL"] },
  { code: "inland_haulage", label: "Inland container haulage", group: "collection", side: "both", modes: ["Sea FCL"] },
  { code: "vgm", label: "Verified gross mass service (VGM)", group: "locals", side: "both", modes: ["Sea FCL"] },
  { code: "container_demurrage", label: "Container demurrage (DEM)", group: "others", side: "both", modes: ["Sea FCL"] },
  { code: "container_detention", label: "Container detention (DET)", group: "others", side: "both", modes: ["Sea FCL"] },
  { code: "truck_waiting", label: "Truck Waiting", group: "others", side: "both", modes: ["Sea FCL", "Sea LCL"] },
  { code: "container_storage", label: "Container Storage", group: "others", side: "both", modes: ["Sea FCL"] },
  { code: "cross_docking", label: "Cross-Docking", group: "locals", side: "both", modes: ["Sea FCL"] },
  { code: "ams_ens", label: "Advance manifest / security filing (AMS / ENS)", group: "locals", side: "both", modes: ["Sea FCL", "Sea LCL"] },
  // Sea Freight LCL
  { code: "lcl_fuel", label: "Fuel / low-sulphur surcharge (BAF / LSS / EFS)", group: "freight", side: "both", modes: ["Sea LCL"] },
  { code: "cfs_origin", label: "Origin CFS handling", group: "locals", side: "both", modes: ["Sea LCL"] },
  { code: "cfs_destination", label: "Destination CFS handling / deconsolidation", group: "locals", side: "both", modes: ["Sea LCL"] },
  { code: "lcl_terminal_handling", label: "Port / terminal handling", group: "locals", side: "both", modes: ["Sea LCL"] },
  { code: "lcl_documentation", label: "House bill of lading / documentation (HBL / DOC)", group: "locals", side: "both", modes: ["Sea LCL"] },
  { code: "lcl_delivery_order", label: "Delivery order / release fee (DO)", group: "locals", side: "both", modes: ["Sea LCL"] },
  { code: "inland_collection", label: "Inland collection / delivery", group: "collection", side: "both", modes: ["Sea LCL"] },
  { code: "cfs_storage", label: "CFS / warehouse storage", group: "others", side: "both", modes: ["Sea LCL"] },
  // Sea Freight Break Bulk
  { code: "bb_bunker", label: "Bunker / low-sulphur surcharge", group: "freight", side: "both", modes: ["Sea Break Bulk"] },
  { code: "loading_stevedoring", label: "Loading stevedoring", group: "locals", side: "both", modes: ["Sea Break Bulk"] },
  { code: "discharge_stevedoring", label: "Discharge stevedoring", group: "locals", side: "both", modes: ["Sea Break Bulk"] },
  { code: "wharfage", label: "Wharfage", group: "locals", side: "both", modes: ["Sea Break Bulk"] },
  { code: "bb_terminal_handling", label: "Terminal handling", group: "locals", side: "both", modes: ["Sea Break Bulk"] },
  { code: "heavy_lift", label: "Crane / heavy-lift equipment hire", group: "others", side: "both", modes: ["Sea Break Bulk"] },
  { code: "lashing", label: "Lashing / unlashing / securing", group: "locals", side: "both", modes: ["Sea Break Bulk"] },
  { code: "dunnage", label: "Dunnage / blocking / bracing", group: "others", side: "both", modes: ["Sea Break Bulk"] },
  { code: "bb_terminal_storage", label: "Terminal storage", group: "others", side: "both", modes: ["Sea Break Bulk"] },
  { code: "bb_pre_carriage", label: "Pre-Carriage", group: "collection", side: "both", modes: ["Sea Break Bulk"] },
  { code: "bb_on_carriage", label: "On-Carriage", group: "collection", side: "both", modes: ["Sea Break Bulk"] },
  // Air Freight
  { code: "air_freight", label: "Air freight", group: "freight", side: "both", modes: ["Air"] },
  { code: "air_fuel", label: "Fuel surcharge (FSC)", group: "freight", side: "both", modes: ["Air"] },
  { code: "air_security", label: "Airline security surcharge (SSC)", group: "freight", side: "both", modes: ["Air"] },
  { code: "air_screening", label: "Security screening / X-ray / ETD", group: "locals", side: "both", modes: ["Air"] },
  { code: "air_export_handling", label: "Export terminal handling", group: "locals", side: "both", modes: ["Air"] },
  { code: "air_import_handling", label: "Import terminal handling", group: "locals", side: "both", modes: ["Air"] },
  { code: "air_documentation", label: "Air waybill / documentation / data fee (AWB)", group: "locals", side: "both", modes: ["Air"] },
  { code: "air_dangerous_goods", label: "Dangerous-goods acceptance / check (DG / DGR)", group: "others", side: "both", modes: ["Air"] },
  { code: "air_special_cargo", label: "Special-cargo handling", group: "locals", side: "both", modes: ["Air"] },
  { code: "air_storage", label: "Cargo-terminal storage", group: "others", side: "both", modes: ["Air"] },
  // Road Freight (Waiting time is also Rail's)
  { code: "road_freight", label: "Basic freight / linehaul", group: "freight", side: "both", modes: ["Road"] },
  { code: "road_fuel", label: "Fuel surcharge", group: "freight", side: "both", modes: ["Road"] },
  { code: "road_toll", label: "Road toll surcharge", group: "freight", side: "both", modes: ["Road"] },
  { code: "waiting_time", label: "Waiting time / truck detention", group: "others", side: "both", modes: ["Road", "Rail"] },
  { code: "tail_lift", label: "Tail-lift collection / delivery", group: "collection", side: "both", modes: ["Road"] },
  { code: "timed_delivery", label: "Fixed-day / timed-delivery surcharge", group: "collection", side: "both", modes: ["Road"] },
  { code: "redelivery", label: "Recollection / redelivery", group: "collection", side: "both", modes: ["Road"] },
  { code: "road_dangerous_goods", label: "Dangerous-goods surcharge (ADR)", group: "others", side: "both", modes: ["Road"] },
  { code: "pallet_exchange", label: "Pallet exchange / pallet-account charge", group: "others", side: "both", modes: ["Road"] },
  { code: "remote_area", label: "Remote-area / restricted-access surcharge", group: "collection", side: "both", modes: ["Road"] },
  // Container Rail Freight
  { code: "rail_freight", label: "Rail freight / linehaul", group: "freight", side: "both", modes: ["Rail"] },
  { code: "rail_thc_origin", label: "Terminal handling — origin (THC)", group: "locals", side: "both", modes: ["Rail"] },
  { code: "rail_thc_destination", label: "Terminal handling — destination (THC)", group: "locals", side: "both", modes: ["Rail"] },
  { code: "rail_pre_carriage", label: "Pre-carriage / drayage", group: "collection", side: "both", modes: ["Rail"] },
  { code: "rail_on_carriage", label: "On-carriage / drayage", group: "collection", side: "both", modes: ["Rail"] },
  { code: "rail_storage", label: "Container storage / demurrage", group: "others", side: "both", modes: ["Rail"] },
  { code: "rail_wagon", label: "Wagon / equipment charge", group: "freight", side: "both", modes: ["Rail"] },
  { code: "rail_dangerous_goods", label: "Dangerous-goods surcharge (ADR/RID)", group: "others", side: "both", modes: ["Rail"] },
  { code: "rail_reefer", label: "Reefer / genset / power supply charge", group: "others", side: "both", modes: ["Rail"] },
  { code: "rail_documentation", label: "Documentation / customs-transit fee", group: "locals", side: "both", modes: ["Rail"] },
  { code: "container_repair", label: "Container cleaning / inspection / repair", group: "others", side: "both", modes: ["Rail"] },
  // Customs Clearance: every mode
  { code: "customs_import", label: "Import customs-clearance fee", group: "customs", side: "both" },
  { code: "customs_export", label: "Export customs-clearance fee", group: "customs", side: "both" },
  { code: "customs_lines", label: "Additional tariff-line fee / multiline entry", group: "customs", side: "both" },
  { code: "bonded_transit", label: "Bonded-transit processing", group: "customs", side: "both" },
  { code: "customs_bond", label: "Customs bond / guarantee fee", group: "customs", side: "both" },
  { code: "duty_advancement", label: "Duty/tax advancement / disbursement fee", group: "customs", side: "both" },
  { code: "customs_amendment", label: "Declaration amendment / data-modification fee", group: "customs", side: "both" },
  { code: "customs_examination", label: "Customs examination coordination / physical intervention", group: "customs", side: "both" },
  { code: "regulatory_clearance", label: "Bio / phyto / veterinary clearance service", group: "customs", side: "both" },
  { code: "bonded_storage", label: "Bonded-storage charge", group: "customs", side: "both" },
  // Not in the sheets, kept for every mode: Other is for whatever they do not name.
  { code: "insurance", label: "Insurance", group: "insurance", side: "both" },
  { code: "other", label: "Other", group: "others", side: "both" },
  // The older catalogue's codes the sheets have no one charge for: rows saved with them keep
  // them. Handling is still what the warehouse's heavy-piece and overweight lines are put under.
  { code: "documentation", label: "Documentation", group: "locals", side: "both", legacy: true },
  { code: "thc_origin", label: "THC Origin", group: "locals", side: "both", legacy: true },
  { code: "thc_destination", label: "THC Destination", group: "locals", side: "both", legacy: true },
  { code: "customs", label: "Customs clearance", group: "customs", side: "both", legacy: true },
  { code: "handling", label: "Handling", group: "locals", side: "both", legacy: true },
  { code: "delivery", label: "Delivery", group: "collection", side: "both", legacy: true },
  { code: "pickup", label: "Pickup", group: "collection", side: "both", legacy: true },
  { code: "inspection", label: "Inspection", group: "others", side: "both", legacy: true },
  { code: "storage", label: "Storage", group: "others", side: "both", legacy: true },
  { code: "demurrage", label: "Demurrage", group: "others", side: "both", legacy: true },
  // Generic keys rows were written with before the catalogue; each may mean several codes
  // above (Freight: ocean, air, rail or road), so their rows keep them.
  { code: "freight", label: "Freight", group: "freight", side: "both", legacy: true },
  { code: "collection", label: "Collection / Delivery", group: "collection", side: "both", legacy: true },
  { code: "locals", label: "Locals", group: "locals", side: "both", legacy: true },
];

// Older keys and labels that mean exactly one code ("Others" is "Other"; "Road freight" is what
// a road line was called before the sheets' names).
const ALIASES: Record<string, string> = {
  others: "other",
  "ocean freight": "ocean_freight",
  "rail freight": "rail_freight",
  "road freight": "road_freight",
};

const byCode = new Map(CHARGE_CODES.map((c) => [c.code, c]));
const byLabel = new Map(CHARGE_CODES.map((c) => [c.label.toLowerCase(), c.code]));

/**
 * The code a category is stored under: a code as it is, a label ("Road toll surcharge") or an older
 * key as its code. Anything else - text typed before the catalogue - is kept as it was given.
 */
export function toChargeCode(value: string): string {
  const typed = value.trim();
  if (byCode.has(typed)) return typed;
  const lower = typed.toLowerCase();
  return ALIASES[lower] ?? byLabel.get(lower) ?? typed;
}

/** What a category reads as: the label of its code, or the stored text itself. */
export function chargeLabel(value: string): string {
  return byCode.get(toChargeCode(value))?.label ?? value;
}

const SEA_MODES: readonly ChargeMode[] = ["Sea FCL", "Sea LCL", "Sea Break Bulk"];

/**
 * The quote freight modes a freight mode stands for: a quote's own ("Sea LCL", or a shipment's
 * "Sea Break Bulk") is itself, a shipment's Sea Freight every sea mode, as it does not say which.
 * Nothing for none or one not known.
 */
export function chargeModesOf(freightMode: string | null | undefined): readonly ChargeMode[] {
  const mode = (freightMode ?? "").trim().toLowerCase();
  if (!mode) return [];
  const own = ["Air", ...SEA_MODES, "Rail", "Road"].find((m) => m.toLowerCase() === mode) as ChargeMode | undefined;
  if (own) return [own];
  if (mode === "sea freight") return SEA_MODES;
  if (mode === "air freight") return ["Air"];
  if (mode === "rail freight") return ["Rail"];
  if (mode === "road freight") return ["Road"];
  return [];
}

export interface ChargeOption {
  value: string;
  label: string;
}

/**
 * The options of a charge picker: the codes offered for new lines - those of the freight mode
 * when one is given (a quote's or a shipment's), else all of them - plus the value a line already
 * holds when it is not one of them (an older code or typed text), so it shows readably.
 */
export function chargeOptions(current?: string, freightMode?: string | null): ChargeOption[] {
  const modes = chargeModesOf(freightMode);
  const offered = CHARGE_CODES.filter((c) => !c.legacy && (!modes.length || !c.modes || c.modes.some((m) => modes.includes(m)))).map((c) => ({
    value: c.code,
    label: c.label,
  }));
  if (!current || offered.some((o) => o.value === current)) return offered;
  return [...offered, { value: current, label: chargeLabel(current) }];
}
