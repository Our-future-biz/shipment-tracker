import type { LaneFill, MonthlySummary, ShipmentUpdateHealth, StorageSummary, TopCustomer } from "./records.interfaces";

// Reports tab: KPIs worked out from the gate stamps, each with its stated start and stop points.
// A figure that cannot be measured is null with the reason in `notMeasured` — never invented.

/** One extra figure of a KPI (per direction, per dock, per type, P90 …). */
export interface WarehouseKpiPart {
  label: string;
  /** null = not measured (no data). */
  value: number | null;
  unit: string;
  /** How many records the figure is built from. */
  n: number;
}

export interface WarehouseKpi {
  /** dwell · gateToReceipt · receiptToRelease · throughput · dockUtilisation · onTime · reweighVariance · exceptionRate · outboxHealth */
  key: string;
  label: string;
  /** null when it cannot be measured in this period (see `notMeasured`). */
  value: number | null;
  /** days · hours · % · positions · per 100 positions · updates */
  unit: string;
  /** How many records the value is built from. */
  n: number;
  /** "How it is measured": start → stop, the population and the rule. */
  measured: string;
  /** Why the value is null (or what is left out); "" when nothing is missing. */
  notMeasured: string;
  breakdown: WarehouseKpiPart[];
}

/** In and out of one day (≤ 31 days) or one ISO week. */
export interface KpiThroughputBucket {
  /** YYYY-MM-DD (day) or the Monday of the week. */
  key: string;
  /** "15.10." or "W42". */
  label: string;
  inPositions: number;
  inPieces: number;
  inKg: number;
  inCbm: number;
  outPositions: number;
  outPieces: number;
  outKg: number;
  outCbm: number;
}

/** The docks and opening hours dock utilisation is measured against. */
export interface KpiDockSettings {
  docks: string[];
  /** HH:MM (Prague) */
  opensAt: string;
  closesAt: string;
  /** ISO weekdays, 1 = Monday … 7 = Sunday. */
  workingDays: number[];
}

export interface WarehouseKpiReport {
  period: {
    /** YYYY-MM-DD (Prague), both days included. */
    from: string;
    to: string;
    days: number;
    /** Throughput buckets: day (≤ 31 days) or ISO week. */
    bucket: string;
  };
  /** ISO */
  generatedAt: string;
  kpis: WarehouseKpi[];
  throughput: KpiThroughputBucket[];
  /** Customers by volume received in the period. */
  topCustomers: TopCustomer[];
  /** This month and the three before it (not filtered by the period). */
  monthly: MonthlySummary[];
  /** Export containers that went out in the period, by discharge port. */
  lanes: LaneFill[];
  /** Cargo in the warehouse now. */
  storage: StorageSummary;
  /** Shipment updates the gate still owes, now. */
  shipmentUpdates: ShipmentUpdateHealth;
  docks: KpiDockSettings;
}
