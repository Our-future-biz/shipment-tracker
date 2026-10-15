// Plain interfaces for controllers and the web client. Never import Drizzle table types here —
// Encore's parser cannot resolve the $inferSelect generic chain.

import type { AvizaceRecord, DeliveryException, WarehouseExceptionItem } from "./avizace.interfaces";

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

/** Our warehouse (the hub every line haul starts or ends at). All empty = not set yet. */
export interface HubAddress {
  name: string;
  street: string;
  /** 5 digits ("11000") */
  postcode: string;
  city: string;
  country: "CZ";
}

/** Waiting at a stop free of charge before the WAITING_TIME surcharge counts (Phase 6). */
export interface WaitingFreeTime {
  /** Whole minutes, 0..1440; default 30 */
  ltlMinutes: number;
  /** Whole minutes, 0..1440; default 120 */
  ftlMinutes: number;
}

export interface TruckingSettings {
  /** Always all 8 codes, in the order of ServiceLevelCode */
  serviceLevels: ServiceLevelSetting[];
  vehicleTypes: VehicleTypeSetting[];
  factors: ChargeableFactors;
  marginFloor: MarginFloor;
  transportOrder: TransportOrderTexts;
  hub: HubAddress;
  waitingFreeTime: WaitingFreeTime;
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
  /** Phase 6: the accounts published in the VAT register, normalised ("19-2000145399/0800" or an IBAN); manual for now */
  bankAccounts: string[];
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
  /** Phase 6: the published accounts (the whole list); left out = kept as saved */
  bankAccounts?: string[];
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
  hub: HubAddress;
  waitingFreeTime: WaitingFreeTime;
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

// ---------------------------------------------------------------------------------------------
// Phase 4: consignments, FTL trips, transport orders, the haulier link and POD.

export type ConsignmentStatus =
  | "BOOKED"
  | "PLANNED"
  | "ORDERED"
  | "CONFIRMED"
  | "PICKED_UP"
  | "AT_HUB"
  | "ON_LINEHAUL"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "POD_RECEIVED"
  | "READY_TO_BILL"
  | "CANCELLED";
export type TripStatus = "DRAFT" | "ORDERED" | "CONFIRMED" | "IN_TRANSIT" | "DONE" | "CANCELLED";
export type StampKind = "confirmed" | "pickedUp" | "delivered" | "podReceived";

export interface StopInput {
  /** A Customer Database site, or null for an address typed in */
  siteId: string | null;
  name: string;
  street: string;
  /** CZ PSČ normalised to 5 digits ("11000"); other countries as typed */
  postcode: string;
  city: string;
  /** ISO 3166 alpha-2 */
  country: string;
  /** ISO datetime (Prague), optional */
  windowFrom: string | null;
  windowTo: string | null;
  contactName: string;
  contactPhone: string;
  avizaceRequired: boolean;
  reference: string;
  notes: string;
}

export interface Stop extends StopInput {
  id: string;
  kind: "PICKUP" | "DELIVERY";
  actualArrival: string | null;
  actualDeparture: string | null;
}

export interface LoadInput {
  pieces: number;
  palletPlaces: number;
  ldm: number;
  weightKg: number;
  cbm: number;
  adr: boolean;
  /** 4 digits when adr */
  adrUn: string;
  adrClass: string;
  adrPackingGroup: "" | "I" | "II" | "III";
  nonStackable: boolean;
  tailLift: boolean;
  b2c: boolean;
  description: string;
}

/** What was priced; never recomputed silently. */
export interface PriceSnapshot {
  source: "TARIFF" | "QUOTE" | "MANUAL";
  tariffId: string | null;
  tariffVersionId: string | null;
  versionNo: number | null;
  tariffName: string;
  serviceLevel: ServiceLevelCode | null;
  currency: "CZK" | "EUR";
  total: number;
  totalCzk: number;
  lines: PriceLine[];
  ratedAt: string;
  overrideReason: string | null;
}

export interface ConsignmentListItem {
  id: string;
  /** "TCZ2026000001" */
  ref: string;
  shipmentId: string;
  jobNumber: string;
  customerId: string;
  customerName: string;
  scope: ConsignmentScope;
  serviceLevel: ServiceLevelCode | null;
  status: ConsignmentStatus;
  pickupDate: string;
  pickupPostcode: string;
  pickupCity: string;
  deliveryPostcode: string;
  deliveryCity: string;
  promisedDate: string | null;
  palletPlaces: number;
  ldm: number;
  weightKg: number;
  chargeableKg: number | null;
  adr: boolean;
  tripId: string | null;
  tripRef: string | null;
  haulierName: string | null;
  sellCzk: number | null;
  /** The haulier cost the Reports use: real where an approved haulier invoice covers it, else the estimate */
  buyCzk: number | null;
  /** Every priced part of the buy is the real cost of an approved haulier invoice (false = estimate) */
  buyReal: boolean;
  /** The approved haulier invoices the real parts of the buy come from */
  buyInvoiceNumbers: string[];
  marginCzk: number | null;
  marginPercent: number | null;
  belowFloor: boolean;
  marginApproved: boolean;
  podReceivedAt: string | null;
  /** Plain-English reasons, e.g. "Pick-up within 24 h and no trip" */
  needsAttention: string[];
  createdAt: string;
  /** Phase 6: the delivery must be announced to the consignee (B2C or the stop says so) */
  avizaceNeeded: boolean;
  /** An avizace is recorded */
  avizaceDone: boolean;
  /** Delivery exceptions not closed yet */
  openExceptions: number;
  /** The job belongs to another department: billed internally (no customer selling lines) */
  internal: boolean;
}

export interface TruckingEventItem {
  id: string;
  kind: string;
  at: string;
  by: string;
  summary: string;
}

export interface ConsignmentDetail extends ConsignmentListItem {
  /** LTL: the customer brings the goods to our warehouse (no pick-up leg) */
  selfDelivered: boolean;
  /** LTL only (null for FTL) */
  lastMile: LastMile | null;
  partnerHaulierCustomerId: string | null;
  /** LTL legs in order (FTL: []) */
  legs: Leg[];
  /** The gate-in at our warehouse confirmed by the warehouse (LTL) */
  gateInAt: string | null;
  /** false = the promised date is an estimate until the warehouse confirms the gate-in (LTL) */
  promisedFinal: boolean;
  pickup: Stop;
  delivery: Stop;
  load: LoadInput;
  /** The customer's price; null when not priced, and for an internal consignment (billed from the Internal tariff) */
  sell: PriceSnapshot | null;
  quoteNumber: string | null;
  stamps: Record<StampKind, { at: string; by: string } | null>;
  marginApproval: { byName: string; at: string; reason: string; marginCzk: number } | null;
  version: number;
  /** Newest first */
  events: TruckingEventItem[];
  permissions: { canCancel: boolean; canApproveMargin: boolean; canVoidStamp: boolean };
  /** Phase 6: the avizace recorded last (null = none) */
  avizace: AvizaceRecord | null;
  /** Newest first */
  exceptions: DeliveryException[];
  /** The Warehouse's OSD exceptions of the job at our hub (LTL), read-only */
  warehouseExceptions: WarehouseExceptionItem[];
}

export interface TransportOrderState {
  number: string;
  sentAt: string | null;
  sentBy: string | null;
  recordedOnly: boolean;
  confirmedAt: string | null;
  confirmedVia: "LINK" | "USER" | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  pinPrinted: boolean;
  podLinkExpiresAt: string | null;
}

export interface TripDetail {
  id: string;
  /** "LCZ2026000001" */
  ref: string;
  kind: TripKind;
  status: TripStatus;
  haulierCustomerId: string;
  haulierName: string;
  haulierStatus: HaulierStatus;
  haulierIssues: HaulierIssue[];
  vehicleTypeCode: string | null;
  tractorPlate: string;
  trailerPlate: string;
  driverName: string;
  driverPhone: string;
  plannedPickupDate: string;
  consignmentIds: string[];
  /** Haulier tariff or agreed price (source MANUAL + reason) */
  buy: PriceSnapshot | null;
  /** From the rate engine at assignment, for audit */
  buyCandidates: PricedSide[];
  transportOrder: TransportOrderState | null;
  version: number;
  events: TruckingEventItem[];
  /** LTL trips: the legs carried, in stop order (FTL: []) */
  legs: TripLeg[];
  /** Leg ids in the order of the stops */
  stopOrder: string[];
  capacity: TripCapacity | null;
  fill: TripFill;
  warnings: string[];
  stamps: { departed: { at: string; by: string } | null; arrived: { at: string; by: string } | null };
}

export interface TripListItem {
  id: string;
  ref: string;
  kind: TripKind;
  status: TripStatus;
  haulierCustomerId: string;
  haulierName: string;
  haulierStatus: HaulierStatus;
  haulierIssues: HaulierIssue[];
  vehicleTypeCode: string | null;
  tractorPlate: string;
  trailerPlate: string;
  driverName: string;
  driverPhone: string;
  plannedPickupDate: string;
  consignmentIds: string[];
  buy: PriceSnapshot | null;
  transportOrder: TransportOrderState | null;
  version: number;
  consignmentRefs: string[];
  /** Against the vehicle type's capacity (FTL: its consignment's load) */
  fill: TripFill;
  /** LTL only, never blocking; [] for FTL */
  warnings: string[];
}

/** What the haulier sees via the link: no prices of the customer. */
export interface PublicTransportOrder {
  orderNumber: string;
  haulierName: string;
  ourCompany: string;
  plannedPickupDate: string;
  pickup: Omit<Stop, "id" | "siteId">;
  delivery: Omit<Stop, "id" | "siteId">;
  load: LoadInput;
  /** The BUY price only */
  agreedPrice: { total: number; currency: string } | null;
  status: "AWAITING_CONFIRMATION" | "CONFIRMED" | "REJECTED" | "DELIVERED";
  podUploaded: boolean;
  linkExpiresAt: string;
}

/** podMissing = delivered more than 2 working days ago without POD */
export type ConsignmentView = "attention" | "pickupToday" | "deliveryToday" | "podMissing" | "readyToBill" | "avizacePending" | "openExceptions";

export interface ConsignmentCounts {
  attention: number;
  pickupToday: number;
  deliveryToday: number;
  podMissing: number;
  readyToBill: number;
  openFtlWithoutHaulier: number;
  avizacePending: number;
  openExceptions: number;
}

export type ConsignmentPriceInput =
  | { source: "TARIFF" }
  | { source: "QUOTE" }
  | { source: "MANUAL"; total: number; currency: "CZK" | "EUR"; reason: string };

export type TripPriceInput = { source: "TARIFF" } | { source: "MANUAL"; total: number; currency: "CZK" | "EUR"; reason: string };

/** The consignment fields a create and an update send. */
export interface ConsignmentFields {
  /** Default FTL; cannot change after the create */
  scope?: ConsignmentScope;
  /** LTL: the customer brings the goods to our warehouse */
  selfDelivered?: boolean;
  /** LTL: own delivery run or a partner network (default OWN_RUN) */
  lastMile?: LastMile | null;
  /** LTL with lastMile PARTNER: the partner haulier, when already known */
  partnerHaulierCustomerId?: string | null;
  quoteNumber: string | null;
  serviceLevel: ServiceLevelCode | null;
  /** YYYY-MM-DD */
  pickupDate: string;
  /** "HH:MM" (Prague) or null */
  pickupTime: string | null;
  pickup: StopInput;
  delivery: StopInput;
  load: LoadInput;
  price: ConsignmentPriceInput;
}

export type TruckingDocumentKind = "POD" | "CMR" | "DELIVERY_NOTE" | "OTHER";

export interface TruckingDocumentItem {
  id: string;
  kind: TruckingDocumentKind;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  source: "USER" | "HAULIER";
}

export type DocLanguageCode = "cs" | "en" | "both";

// ---------------------------------------------------------------------------------------------
// Phase 5: LTL groupage - legs, pick-up runs, line hauls, delivery runs, planning.

export type ConsignmentScope = "FTL" | "LTL";
export type LastMile = "OWN_RUN" | "PARTNER";
export type TripKind = "FTL" | "PICKUP_RUN" | "LINEHAUL" | "DELIVERY_RUN";
export type LtlTripKind = Exclude<TripKind, "FTL">;
export type LegKind = "PICKUP" | "LINEHAUL" | "DELIVERY";
export type LegStatus = "OPEN" | "PLANNED" | "DONE";

export interface Leg {
  id: string;
  consignmentId: string;
  seq: number;
  kind: LegKind;
  fromText: string;
  toText: string;
  tripId: string | null;
  /** The trip's ref when on a trip */
  tripRef: string | null;
  /** The trip's haulier, or the partner of a partner delivery */
  haulierCustomerId: string | null;
  /** The partner's depot (a Customer Database site) of a partner delivery; null = our warehouse */
  depotSiteId: string | null;
  /** A partner delivery's price (partner's BUY tariff, scope LTL, or an agreed price) */
  buy: PriceSnapshot | null;
  /** This leg's share of its trip's buy price (CZK) */
  costShareCzk: number | null;
  status: LegStatus;
}

export interface TripCapacity {
  vehicleTypeCode: string;
  label: string;
  ldm: number;
  kg: number;
  palletPlaces: number;
  tailLift: boolean;
}

/** How full a trip is; the fuller of LDM and kg drives the colour. Percentages null without a vehicle. */
export interface TripFill {
  ldm: number;
  kg: number;
  palletPlaces: number;
  ldmPercent: number | null;
  kgPercent: number | null;
}

/** A leg on a trip, with what the trip page and the planning board show of its consignment. */
export interface TripLeg {
  legId: string;
  kind: LegKind;
  status: LegStatus;
  consignmentId: string;
  consignmentRef: string;
  jobNumber: string;
  shipmentId: string;
  customerName: string;
  fromText: string;
  toText: string;
  fromPostcode: string;
  fromCity: string;
  toPostcode: string;
  toCity: string;
  pieces: number;
  palletPlaces: number;
  ldm: number;
  weightKg: number;
  chargeableKg: number | null;
  adr: boolean;
  tailLift: boolean;
  promisedDate: string | null;
  costShareCzk: number | null;
}

export type Deadline = "overdue" | "today" | "tomorrow" | "later";

/** An unplanned leg on the planning board, with its consignment's basics. */
export interface PlanningLeg {
  legId: string;
  kind: LegKind;
  status: LegStatus;
  seq: number;
  consignmentId: string;
  consignmentRef: string;
  jobNumber: string;
  customerName: string;
  fromText: string;
  toText: string;
  fromPostcode: string;
  fromCity: string;
  toPostcode: string;
  toCity: string;
  /** The tariff zone of the leg's far end (where the run goes), "" when no zone */
  zoneLabel: string;
  serviceLevel: ServiceLevelCode | null;
  pieces: number;
  palletPlaces: number;
  ldm: number;
  weightKg: number;
  chargeableKg: number | null;
  adr: boolean;
  tailLift: boolean;
  pickupDate: string;
  promisedDate: string | null;
  promisedFinal: boolean;
  deadline: Deadline;
}

export interface PlanningTrip {
  id: string;
  ref: string;
  kind: LtlTripKind;
  status: TripStatus;
  date: string;
  haulierCustomerId: string;
  haulierName: string;
  haulierStatus: HaulierStatus;
  vehicleTypeCode: string | null;
  capacity: TripCapacity | null;
  fill: TripFill;
  warnings: string[];
  /** The legs in stop order */
  stops: TripLeg[];
  buyTotal: number | null;
  buyCurrency: "CZK" | "EUR" | null;
  buyTotalCzk: number | null;
  transportOrderSent: boolean;
  version: number;
}

export interface PlanningBoard {
  date: string;
  kind: LtlTripKind;
  unplanned: PlanningLeg[];
  trips: PlanningTrip[];
}
