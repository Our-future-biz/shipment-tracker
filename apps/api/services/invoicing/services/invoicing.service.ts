import { APIError, ErrCode } from "encore.dev/api";
import { quotes } from "~encore/clients";
import { invoiceCostRepository } from "../repositories/invoiceCost.repository";
import { additionalChargeRepository } from "../repositories/additionalCharge.repository";
import { billingSettingsRepository } from "../repositories/billingSettings.repository";
import { billingOverrideRepository } from "../repositories/billingOverride.repository";
import { generatedInvoiceRepository } from "../repositories/generatedInvoice.repository";
import { sellingCostRepository } from "../repositories/sellingCost.repository";
import { quoteCostImportRepository } from "../repositories/quoteCostImport.repository";
import { quoteLinesToCostRows } from "../utils/quoteCostImport.utils";

// Numeric columns (est/real amounts) reject "" in Postgres — coerce blanks to null
// so amounts can be cleared instead of erroring or sticking to a stale value.
function sanitizeAmounts<T extends Record<string, unknown>>(data: T): T {
  const out = { ...data } as Record<string, unknown>;
  for (const key of ["estAmount", "realAmount", "estQty", "realQty", "qty", "amount"]) {
    if (out[key] === "") out[key] = null;
  }
  // undefined klice by pri spreadu prepsaly vychozi hodnoty na undefined
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out as T;
}

class InvoicingService {
  async getInvoicingData(shipmentId: string, companyId: string) {
    const [costs, sellingCosts, additionalCharges, billingSettings, billingOverrides, generatedInvoices] = await Promise.all([
      invoiceCostRepository.listByShipmentId(shipmentId, companyId),
      sellingCostRepository.listByShipmentId(shipmentId, companyId),
      additionalChargeRepository.listByShipmentId(shipmentId, companyId),
      billingSettingsRepository.getByShipmentId(shipmentId, companyId),
      billingOverrideRepository.listByShipmentId(shipmentId, companyId),
      generatedInvoiceRepository.listByShipmentId(shipmentId, companyId),
    ]);
    return { costs, sellingCosts, additionalCharges, billingSettings, billingOverrides, generatedInvoices };
  }

  // ── Buying costs jako volne radky (Costs Breakdown) ──
  async addBuyingCost(shipmentId: string, companyId: string, data: Record<string, unknown>) {
    return invoiceCostRepository.create({ companyId, shipmentId, category: "", ...sanitizeAmounts(data) } as never);
  }

  async updateBuyingCost(id: string, companyId: string, shipmentId: string, data: Record<string, unknown>) {
    return invoiceCostRepository.updateById(id, companyId, shipmentId, sanitizeAmounts(data));
  }

  async deleteBuyingCost(id: string, companyId: string, shipmentId: string) {
    return invoiceCostRepository.deleteById(id, companyId, shipmentId);
  }

  // ── Selling costs ──
  async addSellingCost(shipmentId: string, companyId: string, data: Record<string, unknown>) {
    return sellingCostRepository.create({ companyId, shipmentId, ...sanitizeAmounts(data) } as never);
  }

  async updateSellingCost(id: string, companyId: string, shipmentId: string, data: Record<string, unknown>) {
    return sellingCostRepository.update(id, companyId, shipmentId, sanitizeAmounts(data));
  }

  async deleteSellingCost(id: string, companyId: string, shipmentId: string) {
    return sellingCostRepository.delete(id, companyId, shipmentId);
  }

  // Copies the cost lines of a sales quote into a shipment's Costs Breakdown, one row per line.
  // The lines are read from the quote as it is stored - under the whole reference, variant
  // suffix included: QCZ...-2 is another quote than QCZ... - and never from what a browser holds.
  // A quote is copied to a side once; `force` copies it again.
  async importQuote(
    shipmentId: string,
    companyId: string,
    quoteNumber: string,
    target: "buy" | "sell" | "both",
    force: boolean,
  ): Promise<{ buying: number; selling: number }> {
    let quote;
    try {
      ({ quote } = await quotes.salesQuoteGet({ quoteNumber }));
    } catch (err) {
      if (err instanceof APIError && err.code === ErrCode.NotFound) throw APIError.notFound(`quote ${quoteNumber} not found`);
      throw err;
    }
    const rows = quoteLinesToCostRows(quote.data);
    const copied = await quoteCostImportRepository.copy(
      companyId,
      shipmentId,
      quote.quoteNumber,
      { buying: target === "sell" ? undefined : rows.buying, selling: target === "buy" ? undefined : rows.selling },
      force,
    );
    if (!copied) throw APIError.failedPrecondition(`costs from ${quote.quoteNumber} were already copied to this shipment`);
    return copied;
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
