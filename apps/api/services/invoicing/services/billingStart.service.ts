import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { customers, shipments } from "~encore/clients";
import { billingSettingsRepository } from "../repositories/billingSettings.repository";
import { invoiceRepository } from "../repositories/invoice.repository";

// Where a shipment's billing starts: its billing settings made in its customer's default currency.
// Its own module, so the invoice (invoiceDocument loadContext) can start a billing that never started
// without the whole invoicing service.

/** What a write that would make the billing settings answers while the customer can't be read. */
export const BILLING_CURRENCY_UNKNOWN = "The customer's default currency could not be read — try again in a moment";

/**
 * The currency a shipment's billing starts in when its billing settings are first made, while no
 * invoice was issued for it: its customer's default (Customers → Finance). Undefined - CZK, as
 * before - once it was invoiced or without a customer. A customer that can't be read refuses the
 * write it comes with (unavailable) rather than make the settings in CZK, where they would stay.
 */
export async function startingBillingCurrency(companyId: string, shipmentId: string): Promise<string | undefined> {
  if ((await invoiceRepository.listByShipment(shipmentId, companyId)).length) return undefined;
  try {
    const { shipment } = await shipments.shipmentGet({ shipmentId });
    if (!shipment.customerId) return undefined;
    const { customer } = await customers.customerGet({ id: shipment.customerId });
    return customer.currency || undefined;
  } catch (err) {
    log.warn(err, "the customer's default currency could not be read; the billing settings are not made", { shipmentId });
    throw APIError.unavailable(BILLING_CURRENCY_UNKNOWN);
  }
}

/**
 * A shipment that got its customer (created with one, or linked to one) starts billing in the
 * customer's default currency: its billing settings are made with it, so the Costs Breakdown,
 * the invoice, the billing queue and the customer's totals all read the same currency. Only
 * while it has no billing settings and no invoice - a currency chosen or billed stays. A customer
 * that can't be read leaves the settings unmade (unavailable): the invoice repairs them before it
 * is drawn up (invoiceDocument loadContext).
 */
export async function startBilling(companyId: string, shipmentId: string): Promise<void> {
  if (await billingSettingsRepository.getByShipmentId(shipmentId, companyId)) return;
  const billingCurrency = await startingBillingCurrency(companyId, shipmentId);
  if (billingCurrency) await billingSettingsRepository.createIfMissing(shipmentId, companyId, { billingCurrency });
}
