import { APIError } from "encore.dev/api";
import { warehouse } from "~encore/clients";
import type { Actor } from "../../../lib/rbac";

// Trucking's calls to the Warehouse service (our warehouse = the hub of every line haul) and the
// gate event Warehouse publishes. Warehouse owns gate stamps, dock slots and positions; Trucking
// only announces its trips and listens to the gate.
//
// Each call is made as the user who caused the outbox row (Warehouse needs the company and
// checks the user as for their own request); a failure throws, so the outbox retries it. The
// topic's messages reach ltlService.handleGateStamped through subscriptions/gateStamped.

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
  /** The trip's id, so the warehouse's "From trip" markers link to it (rows written before have none). */
  tripId?: string;
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
  /** The trip's id, so the warehouse's "From trip" markers link to it (rows written before have none). */
  tripId?: string;
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

/** The identity an internal call carries; there is none to make it without. */
const authOf = (as: WarehouseCaller | undefined) => {
  if (!as) throw APIError.failedPrecondition("A warehouse call needs the user it is made for");
  return { authData: as };
};

export async function expectArrival(input: ExpectArrivalInput, as?: WarehouseCaller): Promise<ExpectArrivalResult | null> {
  return warehouse._internalWarehouseExpectArrival(input, authOf(as));
}

export async function expectDeparture(input: ExpectDepartureInput, as?: WarehouseCaller): Promise<WarehouseOk | null> {
  return warehouse._internalWarehouseExpectDeparture(input, authOf(as));
}

export async function cancelExpected(input: CancelExpectedInput, as?: WarehouseCaller): Promise<WarehouseOk | null> {
  return warehouse._internalWarehouseCancelExpected(input, authOf(as));
}
