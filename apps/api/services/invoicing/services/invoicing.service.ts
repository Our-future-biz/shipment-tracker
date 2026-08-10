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
  async getInvoicingData(shipmentId: string, companyId: string) {
    const [costs, additionalCharges, billingSettings, billingOverrides, generatedInvoices] = await Promise.all([
      invoiceCostRepository.listByShipmentId(shipmentId, companyId),
      additionalChargeRepository.listByShipmentId(shipmentId, companyId),
      billingSettingsRepository.getByShipmentId(shipmentId, companyId),
      billingOverrideRepository.listByShipmentId(shipmentId, companyId),
      generatedInvoiceRepository.listByShipmentId(shipmentId, companyId),
    ]);
    return { costs, additionalCharges, billingSettings, billingOverrides, generatedInvoices };
  }

  async upsertCost(shipmentId: string, companyId: string, category: string, data: Record<string, string>) {
    return invoiceCostRepository.upsert(shipmentId, companyId, category, sanitizeAmounts(data));
  }

  async addAdditionalCharge(shipmentId: string, companyId: string, data: Record<string, unknown>) {
    return additionalChargeRepository.create({ companyId, shipmentId, ...sanitizeAmounts(data) } as never);
  }

  async updateAdditionalCharge(id: string, companyId: string, data: Record<string, unknown>) {
    return additionalChargeRepository.update(id, companyId, sanitizeAmounts(data));
  }

  async deleteAdditionalCharge(id: string, companyId: string) {
    return additionalChargeRepository.delete(id, companyId);
  }

  async upsertBillingSettings(shipmentId: string, companyId: string, data: { billingCurrency?: string; roe?: string; quoteRef?: string }) {
    return billingSettingsRepository.upsert(shipmentId, companyId, data);
  }

  async upsertBillingOverride(shipmentId: string, companyId: string, rowKey: string, billingAmount: string) {
    return billingOverrideRepository.upsert(shipmentId, companyId, rowKey, billingAmount === "" ? null : billingAmount);
  }

  async generateInvoice(shipmentId: string, companyId: string, jobNumber: string, invoiceType: string, billingCurrency: string, totalAmount: string) {
    const invoiceNumber = await generatedInvoiceRepository.getNextInvoiceNumber(jobNumber, shipmentId, companyId);
    return generatedInvoiceRepository.create({ companyId, shipmentId, invoiceNumber, invoiceType, billingCurrency, totalAmount });
  }
}

export const invoicingService = new InvoicingService();
