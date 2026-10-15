import type { HaulierStatus, ServiceLevelCode } from "./interfaces";

// Phase 7: the Reports tab of Trucking. KPIs worked out on the server from grouped queries, each
// with its stated start and stop points. A figure that cannot be measured is null with the reason
// in `notMeasured` — never invented. Money in CZK.

/** One extra figure of a KPI (per service level, per scope, per haulier, P90 …). */
export interface TruckingKpiPart {
  label: string;
  /** null = not measured (no data). */
  value: number | null;
  unit: string;
  /** How many records the figure is built from. */
  n: number;
}

export type TruckingKpiKey =
  | "onTime"
  | "firstAttempt"
  | "daysToPod"
  | "podMissing"
  | "lineHaulFill"
  | "costPerKg"
  | "costPerPallet"
  | "margin"
  | "exceptionRate"
  | "avizaceDone";

export interface TruckingKpi {
  key: TruckingKpiKey;
  label: string;
  /** null when it cannot be measured in this period (see `notMeasured`). */
  value: number | null;
  /** % · working days · consignments · CZK/kg · CZK/pallet place · per 100 consignments */
  unit: string;
  /** How many records the value is built from. */
  n: number;
  /** "How it is measured": start → stop, the population and the rule. */
  measured: string;
  /** Why the value is null (or what is left out); "" when nothing is missing. */
  notMeasured: string;
  breakdown: TruckingKpiPart[];
}

/** One line of a margin table (Road consignments delivered in the period; internal ones are left out). */
export interface MarginRow {
  /** customer id / lane key ("11000>60200") / service level code ("" = none) / haulier id */
  key: string;
  /** "TEST Odběratel Ostrava" / "110 00 → 602 00 (zones 1 → 4)" / "+1 day" / haulier name */
  label: string;
  consignments: number;
  sellCzk: number;
  buyCzk: number;
  marginCzk: number;
  /** null when the sell is 0 */
  marginPercent: number | null;
  /** How many consignments were below the floor */
  belowFloor: number;
}

export interface HaulierScore {
  haulierCustomerId: string;
  name: string;
  /** Trips (and partner deliveries) that carried the period's delivered consignments */
  trips: number;
  /** Delivered consignments the haulier carried (any leg) */
  consignments: number;
  /** Of the consignments the haulier delivered (the last leg) */
  onTimePercent: number | null;
  firstAttemptPercent: number | null;
  /** Working days from delivered to POD received */
  avgDaysToPod: number | null;
  /** Claims (CLAIM_HAULIER exceptions) raised in the period */
  claims: number;
  claimedCzk: number;
  /** The haulier's part of the period's delivered consignments (real when invoiced and approved, else estimate) */
  costCzk: number;
  costPerKg: number | null;
  /** Invoices blocked now */
  invoicesBlocked: number;
  /** Σ |difference| of invoices approved in the period */
  invoiceDifferenceCzk: number;
  /** Current profile status */
  status: HaulierStatus;
}

/** A lane asked for (rate calculator / quotes / consignments) that a tariff could not price. */
export interface CoverageGap {
  side: "SELL" | "BUY" | "INTERNAL";
  scope: "LTL" | "FTL" | "LINEHAUL";
  serviceLevel: ServiceLevelCode | null;
  /** CZ postcode, 5 digits */
  postcode: string;
  reason: string;
  /** How many times it was asked for (all time) */
  count: number;
  /** ISO, the last time */
  lastAt: string;
}

/** The Trucking department's result for the period (internal billing included). */
export interface DepartmentResult {
  externalSellCzk: number;
  internalChargesCzk: number;
  haulierCostCzk: number;
  /** externalSell + internalCharges − haulierCost */
  resultCzk: number;
  internalByDepartment: { department: string; amountCzk: number; consignments: number }[];
}

export interface TruckingReport {
  /** YYYY-MM-DD (Prague), both days included */
  from: string;
  to: string;
  kpis: TruckingKpi[];
  marginByCustomer: MarginRow[];
  marginByLane: MarginRow[];
  marginByServiceLevel: MarginRow[];
  hauliers: HaulierScore[];
  coverageGaps: CoverageGap[];
  department: DepartmentResult;
}
