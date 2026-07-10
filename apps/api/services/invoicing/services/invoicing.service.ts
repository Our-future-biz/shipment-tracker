import { invoiceCostRepository } from "../repositories/invoiceCost.repository";
import { additionalChargeRepository } from "../repositories/additionalCharge.repository";
import { billingSettingsRepository } from "../repositories/billingSettings.repository";
import { billingOverrideRepository } from "../repositories/billingOverride.repository";
import { generatedInvoiceRepository } from "../repositories/generatedInvoice.repository";

// Numeric columns (est/real amounts) reject "" in Postgres — coerce blanks to null
// so amounts can be cleared instead of erroring or sticking to a stale value.
function sanitizeAmounts<T extends Record<string, unknown>>(data: T): T {
  const out = { ...data } as Record<string, unknown>;
  for (const key of ["estAmount", "realAmount"]) {
    if (out[key] === "") out[key] = null;
  }
  return out as T;
}

class InvoicingService {
  async getInvoicingData(shipmentId: string) {
    const [costs, additionalCharges, billingSettings, billingOverrides, generatedInvoices] = await Promise.all([
      invoiceCostRepository.listByShipmentId(shipmentId),
      additionalChargeRepository.listByShipmentId(shipmentId),
      billingSettingsRepository.getByShipmentId(shipmentId),
      billingOverrideRepository.listByShipmentId(shipmentId),
      generatedInvoiceRepository.listByShipmentId(shipmentId),
    ]);
    return { costs, additionalCharges, billingSettings, billingOverrides, generatedInvoices };
  }

  async upsertCost(shipmentId: string, category: string, data: Record<string, string>) {
    return invoiceCostRepository.upsert(shipmentId, category, sanitizeAmounts(data));
  }

  async addAdditionalCharge(shipmentId: string, data: Record<string, unknown>) {
    return additionalChargeRepository.create({ shipmentId, ...sanitizeAmounts(data) } as never);
  }

  async updateAdditionalCharge(id: string, data: Record<string, unknown>) {
    return additionalChargeRepository.update(id, sanitizeAmounts(data));
  }

  async deleteAdditionalCharge(id: string) {
    return additionalChargeRepository.delete(id);
  }

  async upsertBillingSettings(shipmentId: string, data: { billingCurrency?: string; roe?: string; quoteRef?: string }) {
    return billingSettingsRepository.upsert(shipmentId, data);
  }

  async upsertBillingOverride(shipmentId: string, rowKey: string, billingAmount: string) {
    return billingOverrideRepository.upsert(shipmentId, rowKey, billingAmount === "" ? null : billingAmount);
  }

  async generateInvoice(shipmentId: string, jobNumber: string, invoiceType: string, billingCurrency: string, totalAmount: string) {
    const invoiceNumber = await generatedInvoiceRepository.getNextInvoiceNumber(jobNumber, shipmentId);
    return generatedInvoiceRepository.create({ shipmentId, invoiceNumber, invoiceType, billingCurrency, totalAmount });
  }
}

export const invoicingService = new InvoicingService();
