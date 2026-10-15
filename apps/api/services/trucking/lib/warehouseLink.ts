import log from "encore.dev/log";
import type { Actor } from "../../../lib/rbac";

// Trucking's calls to the Warehouse service (our warehouse = the hub of every line haul) and the
// gate event Warehouse publishes. Warehouse owns gate stamps, dock slots and positions; Trucking
// only announces its trips and listens to the gate.
//
// NOT WIRED YET: the warehouse internal endpoints and the `warehouse-gate-stamped` topic are
// built in another branch. Until they are merged these functions log and return null, and the
// outbox records the row as sent. After the merge each one calls its endpoint through
// `~encore/clients` (warehouse._internalWarehouseExpectArrival(input, { authData: as }) …), and a
// subscription file hands the topic's messages to ltlService.handleGateStamped.

/** POST /internal/warehouse/expect-arrival — idempotent per (company, shipmentId, tripRef). */
export interface ExpectArrivalInput {
  shipmentId: string;
  tripRef: string;
  tripKind: string;
  haulierName: string;
  plate: string;
  driver: string;
  driverPhone: string;
  /** ISO */
  expectedAt: string;
  pieces: number;
  weightKg: number;
  cbm: number;
}

export interface ExpectArrivalResult {
  positionId: string;
  wczRef: string;
  gateMovementId: string;
  dockSlotId: string | null;
}

/** POST /internal/warehouse/expect-departure */
export interface ExpectDepartureInput {
  shipmentId: string;
  tripRef: string;
  tripKind: string;
  haulierName: string;
  plate: string;
  driver: string;
  driverPhone: string;
  /** ISO */
  expectedAt: string;
}

/** POST /internal/warehouse/cancel-expected */
export interface CancelExpectedInput {
  shipmentId: string;
  tripRef: string;
}

export interface WarehouseOk {
  ok: true;
}

/** The payload of topic `warehouse-gate-stamped` (published by Warehouse after commit). */
export interface GateStampedEvent {
  companyId: string;
  shipmentId: string | null;
  positionId: string;
  wczRef: string;
  kind: "gateIn" | "gateOut" | "voided";
  /** The warehouse stamp ("gateIn", "gateOut"; for a void: the stamp voided) */
  stampKind: string;
  /** ISO */
  at: string;
  userId: string;
}

/** Who the call is made as (the user who caused the outbox row, with their role now). */
export type WarehouseCaller = Pick<Actor, "userID" | "companyID" | "role">;

const notWired = (what: string, shipmentId: string, tripRef: string) => log.warn("warehouse link not wired", { what, shipmentId, tripRef });

export async function expectArrival(input: ExpectArrivalInput, _as?: WarehouseCaller): Promise<ExpectArrivalResult | null> {
  notWired("expect-arrival", input.shipmentId, input.tripRef);
  return null;
}

export async function expectDeparture(input: ExpectDepartureInput, _as?: WarehouseCaller): Promise<WarehouseOk | null> {
  notWired("expect-departure", input.shipmentId, input.tripRef);
  return null;
}

export async function cancelExpected(input: CancelExpectedInput, _as?: WarehouseCaller): Promise<WarehouseOk | null> {
  notWired("cancel-expected", input.shipmentId, input.tripRef);
  return null;
}
