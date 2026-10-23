import type { ShipmentUpdateHealth, StorageSummary } from "./records.interfaces";

// The managers' cockpit (Warehouse Concept → Managers): what is urgent in the warehouse or may
// turn into an issue, counted over every record of the company on the server. Council Outlay 5.

/** One signal on a row, in the module's words ("Pick-up PIN: locked 23.10. 09:12"). */
export interface CockpitTag {
  text: string;
  /** Act today (red); otherwise within 48 hours (amber). */
  urgent: boolean;
}

/** A position (gate record) or a container in a card, once, with all its signals. */
export interface CockpitRow {
  /** position | container */
  kind: string;
  /** The gate record's id, or the container's id. */
  id: string;
  /** Warehouse ref of a position (its gate ref without one), or the container number. */
  ref: string;
  /** Job no. of a position; equipment and status of a container. */
  sub: string;
  customer: string;
  /** Inbound · Outbound · Domestic (in → out) · Import container · Export container */
  direction: string;
  /** příjem | výdej | "" (container) — for the direction's colour. */
  visit: string;
  /** Lifecycle stage label of a position ("In warehouse"); container status otherwise. */
  lifecycle: string;
  /** Free time in a few words ("2 free days left", "Chargeable 4 days · est. CZK 480"); "" when none. */
  freeTime: string;
  tags: CockpitTag[];
}

/** A card: how many rows it has in all, and the first ones (most urgent first). */
export interface CockpitList {
  total: number;
  rows: CockpitRow[];
}

/** The tile row: the Positions quick filters' counts, over every position. */
export interface CockpitTiles {
  inWarehouse: number;
  expectedToday: number;
  needsAttention: number;
  onHold: number;
  customsDeadline: number;
  chargeable: number;
  /** Estimated storage charge to date of the chargeable positions, CZK. */
  chargeableCzk: number;
}

/** What managers did, or what happened to records, in the last `days` days. */
export interface CockpitAudit {
  days: number;
  overrides: number;
  voids: number;
  refusals: number;
  archivedWithStamps: number;
  shipmentsDeleted: number;
}

/** What the warehouse owes other systems and suppliers and has not delivered, now. */
export interface CockpitDelivery {
  /** Shipment updates still pending after `staleMinutes`. */
  shipmentUpdatesWaiting: number;
  /** Events for Trucking (gate-in, gate-out, voids) that failed for good. */
  truckingFailed: number;
  /** Events for Trucking still pending after `staleMinutes`. */
  truckingWaiting: number;
  staleMinutes: number;
  /** Positions whose latest VGM / survey / remeasurement e-mail of the last `supplierEmailDays` days failed or never finished. */
  supplierEmailsFailed: number;
  supplierEmailDays: number;
}

export interface WarehouseManagersCockpit {
  /** ISO time the figures were made. */
  asOf: string;
  /** YYYY-MM-DD, Prague: the day the figures count from. */
  today: string;
  tiles: CockpitTiles;
  /** Act today. */
  urgent: CockpitList;
  /** Within 48 hours, or it becomes urgent. */
  attention: CockpitList;
  /** Shipment updates the gate still owes, now. */
  shipmentUpdates: ShipmentUpdateHealth;
  /** Cargo in the warehouse now, by free time (as on Reports). */
  storage: StorageSummary;
  delivery: CockpitDelivery;
  audit: CockpitAudit;
}
