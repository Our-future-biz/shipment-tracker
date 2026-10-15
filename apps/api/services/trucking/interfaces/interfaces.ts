// Plain interfaces for controllers and the web client. Never import Drizzle table types here —
// Encore's parser cannot resolve the $inferSelect generic chain.

export type ServiceLevelCode = "D1" | "D2" | "D3" | "D4" | "EXP_SAMEDAY" | "EXP_1000" | "EXP_1200" | "EXP_FIXED";

export interface ServiceLevelSetting {
  code: ServiceLevelCode;
  /** "+1 day", "Express by 10:00"… */
  label: string;
  /** D1..D4 = 1..4; EXP_SAMEDAY = 0; EXP_1000/EXP_1200 = 1; EXP_FIXED = 0 (date agreed per order) */
  workingDays: number;
  /** "HH:MM" Europe/Prague, order cut-off for that level */
  cutoff: string;
  active: boolean;
}

export interface VehicleTypeSetting {
  /** Stable key, a-z0-9_ (e.g. "tautliner_136") */
  code: string;
  /** "Tautliner 13.6 m" */
  label: string;
  /** > 0, at most 15.4 (mega trailers / road trains) */
  capacityLdm: number;
  /** > 0 */
  capacityKg: number;
  /** Whole number >= 0 */
  palletPlaces: number;
  tailLift: boolean;
  active: boolean;
}

export interface ChargeableFactors {
  /** Default 1750 */
  kgPerLdm: number;
  /** Default 250 */
  kgPerCbm: number;
  /** Default 400 */
  kgPerPalletPlace: number;
}

export interface MarginFloor {
  /** 0..100, default 8 */
  percent: number;
  /** >= 0, default 300 */
  minAmountCzk: number;
}

export interface TransportOrderTexts {
  /** May contain {orderRef}, {haulier}, {date} */
  emailSubject: string;
  emailBody: string;
}

export interface TruckingSettings {
  /** Always all 8 codes, in the order of ServiceLevelCode */
  serviceLevels: ServiceLevelSetting[];
  vehicleTypes: VehicleTypeSetting[];
  factors: ChargeableFactors;
  marginFloor: MarginFloor;
  transportOrder: TransportOrderTexts;
  version: number;
  updatedAt: string | null;
  /** Display name */
  updatedBy: string | null;
}

export type CostSplitBasis = "chargeable_weight" | "ldm" | "pallet_places";
export type LaneServiceKind = "ANY" | "LTL" | "FTL" | "LINEHAUL";

export interface PreferredLane {
  id: string;
  /** 5-digit CZ PSČ, normalised; from <= to */
  originPostcodeFrom: string;
  originPostcodeTo: string;
  destPostcodeFrom: string;
  destPostcodeTo: string;
  serviceKind: LaneServiceKind;
  note: string;
}

export type HaulierIssueCode =
  | "blocked"
  | "missing_insurance"
  | "insurance_expired"
  | "insurance_expiring"
  | "missing_licence"
  | "licence_expired"
  | "licence_expiring"
  | "vat_unreliable"
  | "vat_check_due";

export interface HaulierIssue {
  code: HaulierIssueCode;
  /** block = cannot be put on a trip */
  severity: "block" | "warn";
  /** Plain English, e.g. "Carrier liability insurance expired on 30 Sep 2026" */
  message: string;
}

export type HaulierStatus = "ok" | "warning" | "blocked";

export interface HaulierProfile {
  customerId: string;
  insurer: string;
  insurancePolicyNo: string;
  /** Carrier liability limit */
  insuranceLimit: number | null;
  /** "CZK" | "EUR" */
  insuranceCurrency: string;
  /** YYYY-MM-DD */
  insuranceValidTo: string | null;
  /** Road transport licence (koncese) */
  licenceNo: string;
  /** YYYY-MM-DD; ignored when licenceUnlimited */
  licenceValidTo: string | null;
  /** A CZ koncese is usually issued without an end date */
  licenceUnlimited: boolean;
  adrCapable: boolean;
  /** VehicleTypeSetting.code values */
  vehicleTypes: string[];
  /** >= 0, default 30 */
  paymentDays: number;
  /** "CZK" | "EUR" */
  currency: string;
  /** Nespolehlivý plátce DPH (manual for now) */
  vatUnreliable: boolean;
  /** Account published in the VAT register (manual for now) */
  bankAccountPublished: boolean;
  /** YYYY-MM-DD of the last manual check; older than 30 days gives vat_check_due (warn) */
  vatCheckedAt: string | null;
  /** Default chargeable_weight */
  costSplitBasis: CostSplitBasis;
  blocked: boolean;
  blockReason: string;
  blockedAt: string | null;
  /** Display name */
  blockedBy: string | null;
  notes: string;
  preferredLanes: PreferredLane[];
  version: number;
}

export interface HaulierListItem {
  customerId: string;
  /** From the Customer Database */
  companyName: string;
  ico: string;
  city: string;
  hasProfile: boolean;
  status: HaulierStatus;
  issues: HaulierIssue[];
  insuranceValidTo: string | null;
  licenceValidTo: string | null;
  adrCapable: boolean;
  vehicleTypes: string[];
  preferredLaneCount: number;
}

export interface HaulierDetail {
  customerId: string;
  companyName: string;
  ico: string;
  dic: string;
  city: string;
  /** Defaults when none is saved yet (version 0) */
  profile: HaulierProfile;
  status: HaulierStatus;
  issues: HaulierIssue[];
}

/** A preferred lane as sent in a profile save; a lane without id is a new one. */
export interface PreferredLaneInput {
  id?: string;
  originPostcodeFrom: string;
  originPostcodeTo: string;
  destPostcodeFrom: string;
  destPostcodeTo: string;
  serviceKind: LaneServiceKind;
  note: string;
}

/** What a profile save may change (block, version and the customer are managed by the server). */
export interface HaulierProfileInput {
  insurer: string;
  insurancePolicyNo: string;
  insuranceLimit: number | null;
  insuranceCurrency: string;
  insuranceValidTo: string | null;
  licenceNo: string;
  licenceValidTo: string | null;
  licenceUnlimited: boolean;
  adrCapable: boolean;
  vehicleTypes: string[];
  paymentDays: number;
  currency: string;
  vatUnreliable: boolean;
  bankAccountPublished: boolean;
  vatCheckedAt: string | null;
  costSplitBasis: CostSplitBasis;
  notes: string;
  preferredLanes: PreferredLaneInput[];
}

/** The settings parts a save sends (all of them). */
export interface TruckingSettingsInput {
  serviceLevels: ServiceLevelSetting[];
  vehicleTypes: VehicleTypeSetting[];
  factors: ChargeableFactors;
  marginFloor: MarginFloor;
  transportOrder: TransportOrderTexts;
}

export interface TruckingHaulierResponse {
  haulier: HaulierDetail;
}

// ---------------------------------------------------------------------------------------------
// Phase 2a: tariffs and the rate engine.

/** BUY = a haulier's prices to us; SELL = our prices to a customer (no owner = the Standard list); INTERNAL = what Trucking charges Operations. */
export type TariffSide = "BUY" | "SELL" | "INTERNAL";
export type TariffScope = "LTL" | "FTL" | "LINEHAUL";
/** DISCOUNT = a customer's % off (negative = uplift) the Standard sell list. */
export type TariffMode = "MATRIX" | "DISCOUNT";
export type ZoneBy = "DESTINATION" | "ORIGIN";
/** TRIP = one price per trip/lane (line haul, FTL) */
export type BandBasis = "KG" | "PALLET" | "LDM" | "TRIP";
/** PER_UNIT = per kg / pallet / LDM of the basis */
export type PriceType = "FLAT" | "PER_UNIT" | "PER_100KG";
export type TariffVersionStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "EXPIRED" | "SUPERSEDED";
export type SurchargeCode =
  | "FUEL"
  | "TOLL"
  | "ADR"
  | "TAIL_LIFT"
  | "AVIZACE"
  | "TIME_WINDOW"
  | "B2C"
  | "WAITING_TIME"
  | "REDELIVERY"
  | "INSURANCE"
  | "REMOTE_AREA"
  | "NON_STACKABLE";
export type SurchargeCalc = "PCT" | "FLAT" | "PER_KG" | "PER_PALLET" | "PER_HOUR" | "PCT_OF_VALUE" | "FUEL_INDEX";

/** A zone: a CZ postcode range, 5 digits, from <= to. Ranges may nest; the narrowest one wins. */
export interface TariffZone {
  code: string;
  label: string;
  postcodeFrom: string;
  postcodeTo: string;
  remote: boolean;
}

export interface TariffBand {
  /** Client-chosen, unique within the version ("b1", "b2"…) */
  id: string;
  basis: BandBasis;
  fromExcl: number;
  /** null = open top band */
  toIncl: number | null;
}

export interface TariffRate {
  serviceLevel: ServiceLevelCode;
  zoneCode: string;
  bandId: string;
  amount: number;
  priceType: PriceType;
}

export interface TariffMinCharge {
  serviceLevel: ServiceLevelCode;
  zoneCode: string;
  amount: number;
}

export interface TariffSurcharge {
  code: SurchargeCode;
  calc: SurchargeCalc;
  /** PCT: 12.5 = 12.5 %; FUEL_INDEX: ignored (the month's % comes from the fuel index) */
  value: number;
  /** Minimum amount of this surcharge */
  min: number | null;
  /** PCT / FUEL_INDEX base: false = freight only, true = freight + the other surcharges */
  onBasePlusSurcharges: boolean;
}

export interface TariffFactors {
  kgPerLdm: number;
  kgPerCbm: number;
  kgPerPalletPlace: number;
}

export interface TariffRounding {
  /** Chargeable weight is rounded up to this step, e.g. 1 */
  weightStepKg: number;
  /** Each price line is rounded to this step, e.g. 0.01 or 1 (whole CZK) */
  moneyStep: number;
}

export interface TariffVersionInput {
  /** YYYY-MM-DD */
  validFrom: string;
  validTo: string | null;
  factors: TariffFactors;
  rounding: TariffRounding;
  zones: TariffZone[];
  bands: TariffBand[];
  rates: TariffRate[];
  minCharges: TariffMinCharge[];
  surcharges: TariffSurcharge[];
  notes: string;
}

export interface ValidationFinding {
  severity: "error" | "warning";
  message: string;
  /** "Sheet D1, zone 3, band 1 001–1 500 kg" style text */
  where: string;
}

export interface TariffVersionSummary {
  id: string;
  versionNo: number;
  status: TariffVersionStatus;
  validFrom: string;
  validTo: string | null;
  createdAt: string;
  /** Display name */
  createdBy: string | null;
  activatedAt: string | null;
  /** Display name */
  activatedBy: string | null;
  serviceLevels: ServiceLevelCode[];
  zoneCount: number;
  warningCount: number;
  errorCount: number;
  /** The uploaded file the version was imported from; null when it was entered without one */
  sourceFileName: string | null;
}

export interface TariffListItem {
  id: string;
  side: TariffSide;
  scope: TariffScope;
  mode: TariffMode;
  name: string;
  /** null owner on SELL = "Standard" */
  ownerCustomerId: string | null;
  ownerName: string | null;
  currency: "CZK" | "EUR";
  zoneBy: ZoneBy;
  /** DISCOUNT mode only */
  discountPercent: number | null;
  activeVersion: TariffVersionSummary | null;
  /** Earliest SCHEDULED */
  nextVersion: TariffVersionSummary | null;
  draftCount: number;
}

export interface TariffDetail extends TariffListItem {
  /** Newest first */
  versions: TariffVersionSummary[];
}

export interface TariffVersionDetail extends TariffVersionSummary {
  tariffId: string;
  input: TariffVersionInput;
  findings: ValidationFinding[];
}

export interface FuelIndexMonth {
  /** "YYYY-MM" */
  month: string;
  percent: number;
}

export interface RateExtras {
  adr: boolean;
  tailLift: boolean;
  avizace: boolean;
  timeWindow: boolean;
  b2c: boolean;
  nonStackable: boolean;
  waitingHours: number;
  declaredValueCzk: number | null;
}

export interface RateRequest {
  /** CZ, normalised server-side */
  fromPostcode: string;
  toPostcode: string;
  /** YYYY-MM-DD */
  pickupDate: string;
  /** "HH:MM" (Prague); null = before cut-off */
  pickupTime: string | null;
  scope: TariffScope;
  pieces: number;
  palletPlaces: number;
  ldm: number;
  weightKg: number;
  cbm: number;
  extras: RateExtras;
  /** SELL: the customer's tariff, else Standard */
  customerId: string | null;
  /** null = all active levels */
  serviceLevels: ServiceLevelCode[] | null;
  includeBuy: boolean;
  includeInternal: boolean;
}

export interface PriceLine {
  code: string;
  label: string;
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
}

export interface PricedSide {
  tariffId: string;
  tariffName: string;
  tariffVersionId: string;
  versionNo: number;
  ownerCustomerId: string | null;
  ownerName: string | null;
  currency: "CZK" | "EUR";
  zoneCode: string;
  zoneLabel: string;
  bandLabel: string;
  /** explanation e.g. "1 250 kg (3 pallets × 400 kg beats 900 kg actual)" */
  chargeable: { basis: BandBasis; quantity: number; explanation: string };
  lines: PriceLine[];
  total: number;
  totalCzk: number;
  /** null when the currency is CZK */
  fx: { rate: number; date: string } | null;
  /** BUY only */
  preferred: boolean;
}

export interface Unpriced {
  /** e.g. "No zone for postcode 790 01 in Standard sell list" */
  reason: string;
}

export interface RateLevelResult {
  serviceLevel: ServiceLevelCode;
  label: string;
  promisedDate: string | null;
  promisedTime: string | null;
  promiseNote: string;
  sell: PricedSide | Unpriced;
  /** Sorted: preferred first, then cheapest */
  buy: PricedSide[];
  /** Hauliers with a price that may not be used (blocked), with why */
  excluded: { customerId: string; name: string; issues: HaulierIssue[] }[];
  /** null when not requested */
  internal: PricedSide | Unpriced | null;
  marginCzk: number | null;
  marginPercent: number | null;
  belowFloor: boolean;
}

export interface RateResponse {
  request: RateRequest;
  ratedAt: string;
  results: RateLevelResult[];
}

// ---------------------------------------------------------------------------------------------
// Phase 2b: the Excel tariff template, the importer, the diff and the test lane.

export interface FileDownload {
  fileName: string;
  fileBase64: string;
  contentType: string;
}

export interface ImportSheetReport {
  sheet: string;
  read: "used" | "ignored" | "missing";
  rows: number;
  note: string;
}

export interface TariffImportResult {
  /** The new DRAFT; its findings include the problems met reading the file ("Sheet D2, row 7, column F") */
  version: TariffVersionDetail;
  sheets: ImportSheetReport[];
}

export interface DiffCell {
  serviceLevel: ServiceLevelCode;
  zoneCode: string;
  /** "1 001–1 500 kg", "Minimum charge" */
  bandLabel: string;
  /** null = absent */
  before: number | null;
  after: number | null;
  /** null when before or after is absent (or before is 0) */
  changePercent: number | null;
}

export interface TariffVersionDiff {
  /** null = nothing to compare with */
  against: TariffVersionSummary | null;
  changedCells: number;
  addedCells: number;
  removedCells: number;
  unchangedCells: number;
  averageChangePercent: number | null;
  maxIncreasePercent: number | null;
  maxDecreasePercent: number | null;
  zonesAdded: string[];
  zonesRemoved: string[];
  levelsAdded: ServiceLevelCode[];
  levelsRemoved: ServiceLevelCode[];
  /** Plain English, e.g. "Fuel surcharge: 12 % → fuel index" */
  surchargeChanges: string[];
  /** Changed, added and removed only; largest change first; at most 500 */
  cells: DiffCell[];
  /** null until Phase 3 */
  affectedOpenQuotes: number | null;
  /** null until Phase 4 */
  affectedOpenConsignments: number | null;
}

export interface TestLaneRequest {
  fromPostcode: string;
  toPostcode: string;
  /** YYYY-MM-DD */
  pickupDate: string;
  pieces: number;
  palletPlaces: number;
  ldm: number;
  weightKg: number;
  cbm: number;
  extras: RateExtras;
}

export interface TestLaneLevel {
  serviceLevel: ServiceLevelCode;
  label: string;
  result: PricedSide | Unpriced;
}
