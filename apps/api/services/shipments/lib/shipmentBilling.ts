import log from "encore.dev/log";
import { invoicing } from "~encore/clients";

/**
 * Tells invoicing a shipment got its customer, so its billing starts in the customer's default
 * currency (invoicing leaves a shipment that has billing settings or an invoice as it is). A
 * failure doesn't undo the shipment's write; it is logged, and the shipment bills in CZK until
 * someone picks the currency.
 */
export async function startShipmentBilling(shipmentId: string): Promise<void> {
  try {
    await invoicing._internalShipmentBillingStart({ shipmentId });
  } catch (err) {
    log.error(err, "the shipment's billing currency could not be started from its customer", { shipmentId });
  }
}
