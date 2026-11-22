import { api } from "encore.dev/api";
import log from "encore.dev/log";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";
import type { RemeasureAcceptance, ShipmentItem } from "../interfaces/interfaces";

interface AcceptRemeasurementRequest {
  shipmentId: string;
  /** The warehouse's remeasured lines as the page shows them (their saved text): changed meanwhile, nothing is accepted. */
  expected: string & MaxLen<100000>;
}

interface AcceptRemeasurementResponse {
  shipment: ShipmentItem;
  acceptance: RemeasureAcceptance | null;
}

/**
 * Cargo Details → Accept remeasurement (owner decision, 18 Nov 2026; since 22 Nov only recorded): the
 * warehouse's remeasured lines are recorded as accepted in the Remeasured by Warehouse tile - Cargo
 * Details' lines, the shipment's Colli, Total Weight and Total Volume and its container stay as they
 * are. Only for who may change the shipment's details (Handled By, Holiday Cover, a manager).
 */
export const shipmentRemeasureAccept = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/remeasurement/accept" },
  async (req: AcceptRemeasurementRequest): Promise<AcceptRemeasurementResponse> => {
    const auth = getAuthData()!;
    const shipment = await shipmentService.acceptRemeasurement(req.shipmentId, auth, req.expected);
    // The acceptance is saved: a read of it failing now (mock test council n18) must not answer
    // "Not accepted". The page reads it again with the shipment.
    const acceptance = await shipmentService.remeasureAcceptance(req.shipmentId, auth.companyID, auth).catch((err: unknown) => {
      log.warn(err, "the accepted remeasurement could not be read back", { shipmentId: req.shipmentId });
      return null;
    });
    return { shipment, acceptance };
  },
);

interface RemeasureAcceptanceRequest {
  shipmentId: string;
}

interface RemeasureAcceptanceResponse {
  acceptance: RemeasureAcceptance | null;
}

/** The shipment's last accepted remeasurement, for Cargo Details and Costs Breakdown; null when none. */
export const shipmentRemeasureAcceptance = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/:shipmentId/remeasurement/acceptance" },
  async (req: RemeasureAcceptanceRequest): Promise<RemeasureAcceptanceResponse> => {
    const auth = getAuthData()!;
    return { acceptance: await shipmentService.remeasureAcceptance(req.shipmentId, auth.companyID, auth) };
  },
);

interface RemeasureCostsCheckedRequest {
  shipmentId: string;
  /**
   * The acceptedAt of the acceptance the page shows (mock test S20-079): when a newer remeasurement was
   * accepted meanwhile, nothing is marked ("A newer remeasurement was accepted: reload to see it").
   * Left out, the newest acceptance is taken.
   */
  acceptedAt?: string & MaxLen<40>;
}

/** Costs Breakdown: its quantities were checked after the last accepted remeasurement (the warning is then put away). */
export const shipmentRemeasureCostsChecked = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/remeasurement/costs-checked" },
  async (req: RemeasureCostsCheckedRequest): Promise<RemeasureAcceptanceResponse> => {
    return { acceptance: await shipmentService.markRemeasureCostsChecked(req.shipmentId, getAuthData()!, req.acceptedAt) };
  },
);
