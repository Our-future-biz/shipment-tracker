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
