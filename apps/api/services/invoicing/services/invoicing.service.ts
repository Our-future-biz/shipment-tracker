import { APIError, ErrCode } from "encore.dev/api";
import { quotes } from "~encore/clients";
import { iso } from "../../../lib/db/serialize";
import { assertShipmentExists } from "../../../lib/shipmentRefs";
import { toChargeCode } from "../../../lib/chargeCodes";
import { quoteCostCopyRefusal } from "../../../lib/salesPolicy";
import { isUuid } from "../../../lib/uuid";
import { definedOnly, toDecimal } from "../lib/amounts";
import { splitAmount } from "../lib/costSplit";
import { invoiceCostRepository } from "../repositories/invoiceCost.repository";
import { additionalChargeRepository } from "../repositories/additionalCharge.repository";
import { billingSettingsRepository } from "../repositories/billingSettings.repository";
import { billingOverrideRepository } from "../repositories/billingOverride.repository";
import { generatedInvoiceRepository } from "../repositories/generatedInvoice.repository";
import { sellingCostRepository } from "../repositories/sellingCost.repository";
import { customsInvoiceLineRepository, customsInvoiceRepository } from "../repositories/customsInvoice.repository";
import { quoteCostImportRepository } from "../repositories/quoteCostImport.repository";
import { quoteFixedChanged } from "../utils/quoteCostImport.utils";
import { truckingLinesRepository } from "../repositories/truckingLines.repository";
import { sameCostCodes } from "../utils/truckingLines.utils";
import { quoteLinesToCostRows } from "../utils/quoteCostImport.utils";
import type { InvoiceCostRecord, NewInvoiceCostRecord } from "../schemas/invoiceCost.schema";
import type { InvoiceSellingCostRecord, NewInvoiceSellingCostRecord } from "../schemas/invoiceSellingCost.schema";
import type {
  InvoiceAdditionalChargeRecord,
  NewInvoiceAdditionalChargeRecord,
} from "../schemas/invoiceAdditionalCharge.schema";
import type { BillingSettingsRecord } from "../schemas/billingSettings.schema";
import type { BillingOverrideRecord } from "../schemas/billingOverride.schema";
import type { GeneratedInvoiceRecord } from "../schemas/generatedInvoice.schema";
import type {
  AdditionalChargeInput,
  AdditionalChargeItem,
  BillingOverrideItem,
  BillingSettingsInput,
  BillingSettingsItem,
  BuyingCostInput,
  CategoryCostInput,
  CostSplitInput,
  CostSplitResultLine,
  GeneratedInvoiceItem,
  InvoiceCostItem,
  InvoicingData,
  SellingCostInput,
  SellingCostItem,
  QuoteImportResult,
  QuoteImportTarget,
} from "../interfaces/interfaces";

// ── Rows → API items ──

const toCostItem = (r: InvoiceCostRecord): InvoiceCostItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  category: r.category,
  description: r.description,
  estQty: r.estQty,
  estAmount: r.estAmount,
  estCurrency: r.estCurrency,
  realQty: r.realQty,
  realAmount: r.realAmount,
  realCurrency: r.realCurrency,
  unit: r.unit,
  invoiceNumber: r.invoiceNumber,
  received: r.received,
  vendor: r.vendor,
  haulierId: r.haulierId,
  sortOrder: r.sortOrder,
  sourceTruckingRef: r.sourceTruckingRef,
  sourceQuoteNumber: r.sourceQuoteNumber,
});

const toSellingItem = (r: InvoiceSellingCostRecord): SellingCostItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  category: r.category,
  description: r.description,
  customer: r.customer,
  qty: r.qty,
  amount: r.amount,
  currency: r.currency,
  invoice: r.invoice,
  sourceBuyId: r.sourceBuyId,
  vatCode: r.vatCode,
  sortOrder: r.sortOrder,
  sourceTruckingRef: r.sourceTruckingRef,
});

const toChargeItem = (r: InvoiceAdditionalChargeRecord): AdditionalChargeItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  invoiceNumber: r.invoiceNumber,
  vendor: r.vendor,
  description: r.description,
  estAmount: r.estAmount,
  estCurrency: r.estCurrency,
  realAmount: r.realAmount,
  realCurrency: r.realCurrency,
  sortOrder: r.sortOrder,
});

const toBillingSettingsItem = (r: BillingSettingsRecord): BillingSettingsItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  billingCurrency: r.billingCurrency,
  roe: r.roe,
  quoteRef: r.quoteRef,
});

const toOverrideItem = (r: BillingOverrideRecord): BillingOverrideItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  rowKey: r.rowKey,
  billingAmount: r.billingAmount,
});

const toInvoiceItem = (r: GeneratedInvoiceRecord): GeneratedInvoiceItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  invoiceNumber: r.invoiceNumber,
  invoiceType: r.invoiceType,
  billingCurrency: r.billingCurrency,
  totalAmount: r.totalAmount,
  createdAt: iso(r.createdAt),
});

// ── Inputs → column values (amounts checked, undefined fields left out) ──

// A category is stored as its charge code, however the caller wrote it ("Road freight").
const chargeCodeOf = (category: string | undefined) => (category === undefined ? undefined : toChargeCode(category));

// "" clears the haulier; anything else must be a company id.
function haulierIdOf(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const id = value.trim();
  if (id === "") return null;
  if (!isUuid(id)) throw APIError.invalidArgument("haulierId must be a company id");
  return id;
}

export function buyingChanges(input: BuyingCostInput): Partial<NewInvoiceCostRecord> {
  return definedOnly({
    ...input,
    category: chargeCodeOf(input.category),
    haulierId: haulierIdOf(input.haulierId),
    estQty: toDecimal(input.estQty, "estQty"),
    estAmount: toDecimal(input.estAmount, "estAmount"),
    realQty: toDecimal(input.realQty, "realQty"),
    realAmount: toDecimal(input.realAmount, "realAmount"),
  });
}

/** Whether a buying write gives the line an estimated quantity or amount. */
export function setsEstimate(changes: Partial<NewInvoiceCostRecord>): boolean {
  return (changes.estQty ?? null) !== null || (changes.estAmount ?? null) !== null;
}

const quoteEstimateOnly = () =>
  APIError.failedPrecondition("this shipment's estimated buying costs come from its quote: a line added here gets a real cost only");

export function sellingChanges(input: SellingCostInput): Partial<NewInvoiceSellingCostRecord> {
  return definedOnly({
    ...input,
    category: chargeCodeOf(input.category),
    qty: toDecimal(input.qty, "qty"),
    amount: toDecimal(input.amount, "amount"),
    // "" goes back to the default by trade direction
    vatCode: input.vatCode === undefined ? undefined : input.vatCode || null,
  });
}

export function chargeChanges(input: AdditionalChargeInput): Partial<NewInvoiceAdditionalChargeRecord> {
  return definedOnly({
    ...input,
    estAmount: toDecimal(input.estAmount, "estAmount"),
    realAmount: toDecimal(input.realAmount, "realAmount"),
  });
}

/**
 * Refuses a buying cost posted by charge code (document reading, a master job's split) onto a job
 * whose cost of that code Trucking keeps: the haulier's cost is already there from the trip and
 * would be counted twice.
 */
async function assertNotKeptByTrucking(companyId: string, shipmentIds: string[], code: string): Promise<void> {
  // The road codes count as one cost: a hand-posted "pickup" on a job Trucking prices as
  // "road_freight" is the same haulier cost twice.
  const codes = sameCostCodes(code);
  for (const id of shipmentIds) {
    if (await truckingLinesRepository.hasBuyingOfCategories(companyId, id, codes)) {
      const job = await assertShipmentExists(id);
      throw APIError.failedPrecondition(
        `Job ${job.jobNumber} has its ${code.replace(/_/g, " ")} cost from Trucking: enter the haulier's invoice in Trucking (Haulier invoices), not here, or it is counted twice`,
      );
    }
  }
}

class InvoicingService {
  async getInvoicingData(shipmentId: string, companyId: string): Promise<InvoicingData> {
    const [costs, sellingCosts, additionalCharges, billingSettings, billingOverrides, generatedInvoices] = await Promise.all([
      invoiceCostRepository.listByShipmentId(shipmentId, companyId),
      sellingCostRepository.listByShipmentId(shipmentId, companyId),
      additionalChargeRepository.listByShipmentId(shipmentId, companyId),
      billingSettingsRepository.getByShipmentId(shipmentId, companyId),
      billingOverrideRepository.listByShipmentId(shipmentId, companyId),
      generatedInvoiceRepository.listByShipmentId(shipmentId, companyId),
    ]);
    return {
      costs: costs.map(toCostItem),
      sellingCosts: sellingCosts.map(toSellingItem),
      additionalCharges: additionalCharges.map(toChargeItem),
      billingSettings: billingSettings ? toBillingSettingsItem(billingSettings) : null,
      billingOverrides: billingOverrides.map(toOverrideItem),
      generatedInvoices: generatedInvoices.map(toInvoiceItem),
    };
  }

  // ── Buying costs: free lines of the Costs Breakdown ──
  // Once a shipment holds buying lines copied from a quote, the estimate is the quote's alone: a
  // line added by hand carries a real cost only (setsEstimate / quoteEstimateOnly).
  async addBuyingCost(shipmentId: string, companyId: string, input: BuyingCostInput): Promise<InvoiceCostItem> {
    const values = { shipmentId, category: "", ...buyingChanges(input) };
    await assertShipmentExists(shipmentId);
    if (setsEstimate(values) && (await invoiceCostRepository.hasQuoteRows(companyId, shipmentId))) throw quoteEstimateOnly();
    return toCostItem(await invoiceCostRepository.createForCompany(companyId, values));
  }

  // A row copied from a quote keeps the quote's charge, words and estimate (QUOTE_FIXED_FIELDS):
  // a change to them is refused, the same value sent back with the rest of the row is not one.
  // Which quote a row came from is set when it is copied and never changes afterwards.
  async updateBuyingCost(id: string, companyId: string, shipmentId: string, input: BuyingCostInput): Promise<InvoiceCostItem> {
    const changes = buyingChanges(input);
    const current = await invoiceCostRepository.findLine(id, companyId, shipmentId);
    if (!current) throw APIError.notFound("Buying cost not found");
    if (current.sourceQuoteNumber && quoteFixedChanged(current, changes).length) {
      throw APIError.failedPrecondition(`this cost was copied from ${current.sourceQuoteNumber}: its category, description and estimate stay as the quote has them`);
    }
    if (!current.sourceQuoteNumber && setsEstimate(changes) && (await invoiceCostRepository.hasQuoteRows(companyId, shipmentId))) throw quoteEstimateOnly();
    const row = await invoiceCostRepository.updateLine(id, companyId, shipmentId, changes);
    if (!row) throw APIError.notFound("Buying cost not found");
    return toCostItem(row);
  }

  // A row copied from a quote is not deleted: the estimate stays the quote's.
  async deleteBuyingCost(id: string, companyId: string, shipmentId: string): Promise<void> {
    const current = await invoiceCostRepository.findLine(id, companyId, shipmentId);
    if (!current) throw APIError.notFound("Buying cost not found");
    if (current.sourceQuoteNumber) {
      throw APIError.failedPrecondition(`this cost was copied from ${current.sourceQuoteNumber}: it stays as the quote has it`);
    }
    if (!(await invoiceCostRepository.softDeleteLine(id, companyId, shipmentId))) throw APIError.notFound("Buying cost not found");
  }

  /**
   * A buying cost posted by its charge code (master jobs, document reading). It goes onto the
   * shipment's first line of that code - so a real cost lands on the estimate it belongs to
   * instead of a second line - and a line is created when the shipment has none.
   */
  async upsertCost(shipmentId: string, companyId: string, category: string, input: CategoryCostInput): Promise<InvoiceCostItem> {
    const code = toChargeCode(category);
    await assertNotKeptByTrucking(companyId, [shipmentId], code);
    const changes = buyingChanges(input);
    // Checked again under the shipment's trucking-lines lock, so a Trucking push running at the
    // same moment can't slip its line in between the check and this write.
    return truckingLinesRepository.withShipmentLock(shipmentId, async () => {
      await assertNotKeptByTrucking(companyId, [shipmentId], code);
      const existing = await invoiceCostRepository.findByCategory(shipmentId, companyId, code);
      // On a shipment priced from a quote the real cost lands and the estimate stays the quote's.
      const quoted = existing?.sourceQuoteNumber || (await invoiceCostRepository.hasQuoteRows(companyId, shipmentId));
      const kept = quoted ? definedOnly({ ...changes, estAmount: undefined, estCurrency: undefined }) : changes;
      if (existing) {
        const row = await invoiceCostRepository.updateLine(existing.id, companyId, shipmentId, kept);
        if (!row) throw APIError.notFound("Buying cost not found");
        return toCostItem(row);
      }
      await assertShipmentExists(shipmentId);
      return toCostItem(await invoiceCostRepository.createForCompany(companyId, { shipmentId, category: code, ...kept }));
    });
  }

  /**
   * One vendor invoice split over shipments by weight (a master job's invoice by freight tons):
   * the parts add up to the total to the cent and are posted as the real cost of each
   * shipment's line of the code. A shipment of weight 0 gets nothing. A shipment that already
   * has a real cost of the code keeps it unless it is in `overwriteShipmentIds`; its part is
   * not handed to the others. `dryRun` only answers the split and what each shipment has.
   */
  async splitCost(companyId: string, input: CostSplitInput): Promise<CostSplitResultLine[]> {
    const code = toChargeCode(input.category);
    const total = toDecimal(input.total, "total");
    if (!total || Number(total) <= 0) throw APIError.invalidArgument("total must be above 0");
    const ids = input.lines.map((l) => l.shipmentId);
    if (!ids.every(isUuid)) throw APIError.invalidArgument("shipmentId must be a shipment id");
    if (new Set(ids).size !== ids.length) throw APIError.invalidArgument("a shipment is listed twice");
    const weights = input.lines.map((l) => l.weight);
    if (weights.some((w) => !Number.isFinite(w) || w < 0)) throw APIError.invalidArgument("a weight must be a number of at least 0");
    if (!weights.some((w) => w > 0)) throw APIError.invalidArgument("no shipment has a weight to split by");

    // A job whose cost of the code Trucking keeps would count it twice: refused before anything is written.
    await assertNotKeptByTrucking(companyId, input.lines.filter((l) => l.weight > 0).map((l) => l.shipmentId), code);
    const parts = splitAmount(total, weights);
    const overwrite = new Set(input.overwriteShipmentIds ?? []);
    const result: CostSplitResultLine[] = [];
    for (const [i, line] of input.lines.entries()) {
      const row = await invoiceCostRepository.findByCategory(line.shipmentId, companyId, code);
      const existing = row?.realAmount
        ? { realAmount: row.realAmount, realCurrency: row.realCurrency, invoiceNumber: row.invoiceNumber }
        : null;
      const amount = line.weight > 0 ? parts[i]! : null;
      const write = !input.dryRun && amount !== null && (!existing || overwrite.has(line.shipmentId));
      if (write) {
        await this.upsertCost(line.shipmentId, companyId, code, {
          realAmount: amount,
          realCurrency: input.currency,
          invoiceNumber: input.invoiceNumber.trim(),
          ...(input.vendor?.trim() ? { vendor: input.vendor.trim() } : {}),
        });
      }
      result.push({ shipmentId: line.shipmentId, amount, existing, written: write });
    }
    return result;
  }

  // ── Selling costs ──
  async addSellingCost(shipmentId: string, companyId: string, input: SellingCostInput): Promise<SellingCostItem> {
    const values = { shipmentId, ...sellingChanges(input) };
    await assertShipmentExists(shipmentId);
    return toSellingItem(await sellingCostRepository.createForCompany(companyId, values));
  }

  async updateSellingCost(id: string, companyId: string, shipmentId: string, input: SellingCostInput): Promise<SellingCostItem> {
    const row = await sellingCostRepository.updateLine(id, companyId, shipmentId, sellingChanges(input));
    if (!row) throw APIError.notFound("Selling cost not found");
    return toSellingItem(row);
  }

  async deleteSellingCost(id: string, companyId: string, shipmentId: string): Promise<void> {
    if (!(await sellingCostRepository.softDeleteLine(id, companyId, shipmentId))) throw APIError.notFound("Selling cost not found");
  }

  // ── Copy from a sales quote ──
  // Copies the cost lines of a sales quote into a shipment's Costs Breakdown, one row per line.
  // The lines are read from the quote as it is stored - under the whole reference, variant
  // suffix included: QCZ...-2 is another quote than QCZ... - and never from what a browser holds.
  // A quote is copied to a side once; `force` copies it again. Copied selling rows are new rows,
  // so the invoice guard (rows already on an issued invoice) applies to them as to any other.
  async importQuote(
    shipmentId: string,
    companyId: string,
    quoteNumber: string,
    target: QuoteImportTarget,
    force: boolean,
  ): Promise<QuoteImportResult> {
    await assertShipmentExists(shipmentId);
    let quote;
    try {
      ({ quote } = await quotes.salesQuoteGet({ quoteNumber }));
    } catch (err) {
      if (err instanceof APIError && err.code === ErrCode.NotFound) throw APIError.notFound(`quote ${quoteNumber} not found`);
      throw err;
    }
    // Only a Won quote's costs. A quote a shipment is created from is Won by now: it is told first.
    const refusal = quoteCostCopyRefusal(quote.effectiveStatus);
    if (refusal) throw APIError.failedPrecondition(`${quote.quoteNumber} - ${refusal}`);
    // A job with a Trucking consignment gets its road freight from Trucking: the quote's trucking lines are left out.
    const skipTrucking = await truckingLinesRepository.hasConsignmentRows(companyId, shipmentId);
    const rows = quoteLinesToCostRows(quote.data, { skipTrucking });
    const copied = await quoteCostImportRepository.copy(
      companyId,
      shipmentId,
      quote.quoteNumber,
      { buying: target === "sell" ? undefined : rows.buying, selling: target === "buy" ? undefined : rows.selling },
      force,
    );
    // The details tell this refusal from the one above: copying again can be asked for.
    if (!copied) throw APIError.failedPrecondition(`costs from ${quote.quoteNumber} were already copied to this shipment`).withDetails({ alreadyCopied: true });
    return copied;
  }

  // ── Additional charges ──
  async addAdditionalCharge(shipmentId: string, companyId: string, input: AdditionalChargeInput): Promise<AdditionalChargeItem> {
    const values = { shipmentId, ...chargeChanges(input) };
    await assertShipmentExists(shipmentId);
    return toChargeItem(await additionalChargeRepository.createForCompany(companyId, values));
  }

  async updateAdditionalCharge(id: string, companyId: string, shipmentId: string, input: AdditionalChargeInput): Promise<AdditionalChargeItem> {
    const row = await additionalChargeRepository.updateForCompany(id, companyId, chargeChanges(input));
    if (!row || row.shipmentId !== shipmentId) throw APIError.notFound("Charge not found");
    return toChargeItem(row);
  }

  async deleteAdditionalCharge(id: string, companyId: string, shipmentId: string): Promise<void> {
    const charge = await additionalChargeRepository.getByIdForCompany(id, companyId);
    if (!charge || charge.shipmentId !== shipmentId) throw APIError.notFound("Charge not found");
    await additionalChargeRepository.softDeleteForCompany(id, companyId);
  }

  // ── Billing ──
  async upsertBillingSettings(shipmentId: string, companyId: string, input: BillingSettingsInput): Promise<BillingSettingsItem> {
    const roe = toDecimal(input.roe, "roe", 6);
    if (roe === null) throw APIError.invalidArgument("roe can't be cleared");
    const data = definedOnly({ ...input, roe });
    if (!(await billingSettingsRepository.getByShipmentId(shipmentId, companyId))) await assertShipmentExists(shipmentId);
    return toBillingSettingsItem(await billingSettingsRepository.upsert(shipmentId, companyId, data));
  }

  async upsertBillingOverride(shipmentId: string, companyId: string, rowKey: string, billingAmount: string): Promise<BillingOverrideItem> {
    const amount = toDecimal(billingAmount, "billingAmount") ?? null;
    await assertShipmentExists(shipmentId);
    return toOverrideItem(await billingOverrideRepository.upsert(shipmentId, companyId, rowKey, amount));
  }

  /**
   * A deleted shipment's costs, charges, billing and customs lines are retired with it.
   * Generated invoices stay: an issued invoice number is a legal record.
   */
  async retireShipment(shipmentId: string, companyId: string): Promise<void> {
    await Promise.all([
      invoiceCostRepository.softDeleteForShipment(shipmentId, companyId),
      sellingCostRepository.softDeleteForShipment(shipmentId, companyId),
      additionalChargeRepository.softDeleteForShipment(shipmentId, companyId),
      billingSettingsRepository.softDeleteForShipment(shipmentId, companyId),
      billingOverrideRepository.softDeleteForShipment(shipmentId, companyId),
      customsInvoiceLineRepository.softDeleteForShipment(shipmentId, companyId),
      customsInvoiceRepository.softDeleteForShipment(shipmentId, companyId),
    ]);
  }
}

export const invoicingService = new InvoicingService();
