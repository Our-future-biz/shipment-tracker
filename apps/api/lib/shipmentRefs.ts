import { APIError, ErrCode } from "encore.dev/api";
import { shipments } from "~encore/clients";

// Services that keep rows per shipment (invoicing, warehouse, automation) can't have a foreign
// key to the shipments database, so they ask the shipments service before writing for a new id.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves when the shipment exists and is live in the caller's company (the caller's auth is
 * passed along on service calls, so shipmentGet is company-scoped); throws notFound otherwise.
 * Gives back the shipment's job number, for callers that number things after it.
 */
export async function assertShipmentExists(shipmentId: string): Promise<{ jobNumber: string }> {
  if (!UUID.test(shipmentId)) throw APIError.invalidArgument("Not a shipment id");
  try {
    const { shipment } = await shipments.shipmentGet({ shipmentId });
    return { jobNumber: shipment.jobNumber };
  } catch (err) {
    if (err instanceof APIError && err.code === ErrCode.NotFound) throw APIError.notFound("Shipment not found");
    throw err;
  }
}
