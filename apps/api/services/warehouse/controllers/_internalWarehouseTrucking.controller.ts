import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { truckingExpectService } from "../services/truckingExpect.service";
import { truckingExceptionsService, type ShipmentException } from "../services/truckingExceptions.service";

// Internal API of the warehouse for Trucking (trips through our warehouse, the hub). Called as the
// user who planned the trip; never stamps anything — Warehouse keeps owning the gate. Each call is
// idempotent per (company, shipmentId, tripRef). Gate-ins and gate-outs are told back on the
// warehouse-gate-stamped topic (topics.ts).

interface ExpectArrivalRequest {
  shipmentId: string;
  /** The trip's reference (LCZ…). */
  tripRef: string;
  /** FTL | PICKUP_RUN | LINEHAUL | DELIVERY_RUN */
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
  /** The trip's id in Trucking (optional): the "From trip LCZ…" markers link to the trip. */
  tripId?: string;
}

interface ExpectArrivalResponse {
  /** The warehouse position (warehouse task id). */
  positionId: string;
  /** Its WCZ reference. */
  wczRef: string;
  gateMovementId: string;
  /** The dock slot booked for the expected time; null when no dock is free then (logged). */
  dockSlotId: string | null;
}

/**
 * The shipment's WCZ position and gate record exist (made from the shipment when missing), its IN
 * transport leg carries the trip's truck and planned gate time ("From trip LCZ…", read-only), and a
 * dock slot is booked when a dock is free — so it shows in Expected today.
 */
export const _internalWarehouseExpectArrival = api(
  { expose: false, auth: true, method: "POST", path: "/internal/warehouse/expect-arrival" },
  async (req: ExpectArrivalRequest): Promise<ExpectArrivalResponse> => {
    const { companyID, userID } = getAuthData()!;
    return truckingExpectService.expectArrival(companyID, userID, req);
  },
);

interface ExpectDepartureRequest {
  shipmentId: string;
  tripRef: string;
  tripKind: string;
  haulierName: string;
  plate: string;
  driver: string;
  driverPhone: string;
  /** ISO */
  expectedAt: string;
  /** The trip's id in Trucking (optional): the "From trip LCZ…" markers link to the trip. */
  tripId?: string;
}

interface OkResponse {
  ok: true;
}

/** The OUT transport leg and the shipment's pick-up row get the trip's truck ("From trip LCZ…"); a dock slot is booked. */
export const _internalWarehouseExpectDeparture = api(
  { expose: false, auth: true, method: "POST", path: "/internal/warehouse/expect-departure" },
  async (req: ExpectDepartureRequest): Promise<OkResponse> => {
    const { companyID, userID } = getAuthData()!;
    return truckingExpectService.expectDeparture(companyID, userID, req);
  },
);

interface CancelExpectedRequest {
  shipmentId: string;
  tripRef: string;
}

/** Clears what the two above set for that trip. Never touches a stamp; a position already gated in stays. */
export const _internalWarehouseCancelExpected = api(
  { expose: false, auth: true, method: "POST", path: "/internal/warehouse/cancel-expected" },
  async (req: CancelExpectedRequest): Promise<OkResponse> => {
    const { companyID, userID } = getAuthData()!;
    return truckingExpectService.cancelExpected(companyID, userID, req);
  },
);

interface ExceptionsForShipmentsRequest {
  shipmentIds: string[];
}

interface ExceptionsForShipmentsResponse {
  exceptions: ShipmentException[];
}

/** Read-only: the OS&D exceptions (Damaged / Short / Over) of the shipments' positions, for Trucking's consignment page. */
export const _internalWarehouseExceptionsForShipments = api(
  { expose: false, auth: true, method: "POST", path: "/internal/warehouse/exceptions-for-shipments" },
  async ({ shipmentIds }: ExceptionsForShipmentsRequest): Promise<ExceptionsForShipmentsResponse> => {
    return { exceptions: await truckingExceptionsService.forShipments(getAuthData()!.companyID, shipmentIds) };
  },
);
