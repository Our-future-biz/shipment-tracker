import { APIError, ErrCode } from "encore.dev/api";
import log from "encore.dev/log";
import { customers, quotes, shipments } from "~encore/clients";
import { iso } from "../../../lib/db/serialize";
import { assertShipmentExists } from "../../../lib/shipmentRefs";
import { BILLED, assertNotBilled, isBilled, leavesBuyingCostAlone } from "../lib/billedLock";
import { toChargeCode } from "../../../lib/chargeCodes";
import { canDecideQuoteInquiry, quoteCostCopyRefusal } from "../../../lib/salesPolicy";
import { isSalesReference } from "../../../lib/salesReference";
import { isUuid } from "../../../lib/uuid";
import { businessDay, isRealYmd } from "../../../lib/businessDate";
import { userEmailOf } from "../../../lib/companyUsers";
import { constraintOf } from "../../../lib/db/errors";
import { definedOnly, toDecimal } from "../lib/amounts";
import { splitAmount } from "../lib/costSplit";
import { invoiceLineProblem, invoiceRows, invoiceRowsProblem, onMasterJob, ontoEstimates } from "../lib/invoiceLines";
import { invoiceCostRepository } from "../repositories/invoiceCost.repository";
import { additionalChargeRepository } from "../repositories/additionalCharge.repository";
import { billingSettingsRepository } from "../repositories/billingSettings.repository";
import { billingOverrideRepository } from "../repositories/billingOverride.repository";
import { generatedInvoiceRepository } from "../repositories/generatedInvoice.repository";
import { invoiceRepository } from "../repositories/invoice.repository";
import { sellingCostRepository } from "../repositories/sellingCost.repository";
import { customsInvoiceLineRepository, customsInvoiceRepository } from "../repositories/customsInvoice.repository";
import { quoteCostImportRepository } from "../repositories/quoteCostImport.repository";
import { quoteFixedChanged } from "../utils/quoteCostImport.utils";
import { truckingLinesRepository } from "../repositories/truckingLines.repository";
import { sameCostCodes } from "../utils/truckingLines.utils";
import { quoteLinesToCostRows, type QuoteBuyingRow } from "../utils/quoteCostImport.utils";
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
  InvoiceLinesInput,
  InvoiceLinesRow,
  CostSplitResultLine,
  CostsQuoteItem,
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
  receivedAt: r.receivedAt ? r.receivedAt.toISOString() : null,
  paidOn: r.paidOn ?? "",
  paidBy: r.paidOn ? (r.paidBy ?? "") : "",
  paidAt: r.paidOn && r.paidAt ? r.paidAt.toISOString() : null,
  vendor: r.vendor,
  haulierId: r.haulierId,
  supplierCustomerId: r.supplierCustomerId,
  sortOrder: r.sortOrder,
  sourceTruckingRef: r.sourceTruckingRef,
  sourceMasterJobRef: r.sourceMasterJobRef,
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
  sourceMasterJobRef: r.sourceMasterJobRef,
  createdAt: r.createdAt.toISOString(),
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

// "" clears the company; anything else must be a company id.
function companyIdOf(value: string | undefined, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  const id = value.trim();
  if (id === "") return null;
  if (!isUuid(id)) throw APIError.invalidArgument(`${field} must be a company id`);
  return id;
}

// "" takes the payment back; anything else must be a real date.
function paidOnOf(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const day = value.trim();
  if (day === "") return null;
  if (!isRealYmd(day)) throw APIError.invalidArgument("paidOn must be a date (yyyy-mm-dd)");
  return day;
}

/**
 * When the vendor's invoice came and when it was paid (Council Outlay 7, step 6b): ticking Received stamps
 * the moment (its due day is that plus the supplier's payment days), unticking it clears both, and a cost
 * is paid only once its invoice was received, on a day neither after today nor before the (Prague) day it was
 * received - not checked for a line received before that day was kept. `current` is the stored line (null
 * for a new one).
 */
export function receiptChanges(
  current: { received: boolean; receivedAt: Date | null; paidOn: string | null } | null,
  changes: Partial<NewInvoiceCostRecord>,
  now: Date,
  today: string,
  by: { userId: string; email: string } | null = null,
): Partial<NewInvoiceCostRecord> {
  const out: Partial<NewInvoiceCostRecord> = {};
  const unpaid = { paidOn: null, paidAt: null, paidByUserId: null, paidBy: null };
  if (changes.received === true && !current?.received) out.receivedAt = now;
  if (changes.received === false) Object.assign(out, { receivedAt: null }, unpaid);
  const received = changes.received ?? current?.received ?? false;
  if (changes.paidOn) {
    if (!received) throw APIError.invalidArgument("Tick Received first: a cost is paid once its invoice came");
    if (changes.paidOn > today) throw APIError.invalidArgument("The day it was paid cannot be after today");
    const receivedAt = out.receivedAt ?? current?.receivedAt ?? null;
    const receivedOn = receivedAt ? businessDay(receivedAt) : "";
    if (changes.paidOn < receivedOn) throw APIError.invalidArgument(`The day it was paid cannot be before its invoice was received (${receivedOn})`);
    // Who noted it and when (K6): Paid is what takes a cost off the supplier's What we owe.
    Object.assign(out, { paidAt: now, paidByUserId: by?.userId || null, paidBy: by?.email || null });
  } else if (changes.paidOn === null) {
    Object.assign(out, unpaid);
  }
  return out;
}

/** Who sets a paid day, looked up only when one is set. */
async function payer(changes: Partial<NewInvoiceCostRecord>, actorUserId: string) {
  return changes.paidOn ? { userId: actorUserId, email: await userEmailOf(actorUserId) } : null;
}

/**
 * A line links only a live company of the Customer Database with a supplier role (m8): read as the user, so
 * one they cannot open is refused too. Only a link that changes is checked.
 */
async function assertSupplierCompany(id: string | null | undefined, current: string | null): Promise<void> {
  if (!id || id === current) return;
  let roles: string[];
  try {
    roles = (await customers.customerGet({ id })).customer.roles;
  } catch (err) {
    if (err instanceof APIError && err.code === ErrCode.NotFound) throw APIError.invalidArgument("The supplier is not a company of the Customer Database");
    throw err;
  }
  if (!roles.some((r) => r !== "customer")) throw APIError.invalidArgument("The company picked is no supplier: give it a supplier role in the Customer Database first");
}

/**
 * A vendor written without a link names no company any more: the line's link goes with the old text (C-7), as
 * typing over a picked name unlinks it in Costs Breakdown. The same text sent again keeps it.
 */
function unlinkOnVendorChange(current: { vendor: string } | null, changes: Partial<NewInvoiceCostRecord>): Partial<NewInvoiceCostRecord> {
  if (changes.vendor === undefined || changes.supplierCustomerId !== undefined || changes.vendor === current?.vendor) return {};
  return { supplierCustomerId: null };
}

// The supplier roles of the Customer Database: every role but customer.
type CompanyRole = Parameters<typeof customers._internalCompaniesWithRole>[0]["role"];
const SUPPLIER_ROLES: readonly CompanyRole[] = ["haulier", "rail_operator", "first_last_mile_haulier", "shipping_line", "co_loader"];

/**
 * A quote's buying rows with only the links that name a live supplier of the Customer Database (C-7): the quote's
 * document comes from browsers, so an id that is no supplier of this company is dropped and the name stays, typed.
 */
async function withLiveSuppliers(rows: QuoteBuyingRow[]): Promise<QuoteBuyingRow[]> {
  const ids = [...new Set(rows.flatMap((r) => (r.supplierCustomerId ? [r.supplierCustomerId.toLowerCase()] : [])))];
  if (!ids.length) return rows;
  const found = await Promise.all(SUPPLIER_ROLES.map((role) => customers._internalCompaniesWithRole({ role, ids })));
  const live = new Set(found.flatMap((f) => f.companies.map((c) => c.id.toLowerCase())));
  return rows.map((r) => {
    const id = r.supplierCustomerId?.toLowerCase() ?? null;
    return { ...r, supplierCustomerId: id && live.has(id) ? id : null };
  });
}

export function buyingChanges(input: BuyingCostInput): Partial<NewInvoiceCostRecord> {
  return definedOnly({
    ...input,
    paidOn: paidOnOf(input.paidOn),
    category: chargeCodeOf(input.category),
    haulierId: companyIdOf(input.haulierId, "haulierId"),
    supplierCustomerId: companyIdOf(input.supplierCustomerId, "supplierCustomerId"),
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
export async function assertNotKeptByTrucking(companyId: string, shipmentIds: string[], code: string): Promise<void> {
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

/**
 * The currency a shipment's billing starts in when its billing settings are first made, while no
 * invoice was issued for it: its customer's default (Customers → Finance). Undefined - CZK, as
 * before - once it was invoiced, without a customer, or when the customer can't be read (which
 * must not stop the write it comes with).
 */
async function startingBillingCurrency(companyId: string, shipmentId: string): Promise<string | undefined> {
  if ((await invoiceRepository.listByShipment(shipmentId, companyId)).length) return undefined;
  try {
    const { shipment } = await shipments.shipmentGet({ shipmentId });
    if (!shipment.customerId) return undefined;
    const { customer } = await customers.customerGet({ id: shipment.customerId });
    return customer.currency || undefined;
  } catch (err) {
    log.warn(err, "the customer's default currency could not be read; billing starts in CZK", { shipmentId });
    return undefined;
  }
}

// The sales quote the costs were copied from, read from the quotes service. A reference that
// names no sales quote, or one that cannot be read, gives null: the costs load all the same.
async function costsQuoteOf(quoteRef: string | undefined): Promise<CostsQuoteItem | null> {
  const quoteNumber = (quoteRef ?? "").trim();
  if (!isSalesReference(quoteNumber)) return null;
  try {
    const { quote } = await quotes.salesQuoteGet({ quoteNumber });
    return { quoteNumber: quote.quoteNumber, validUntil: quote.validUntil, ownerName: quote.ownerName };
  } catch (err) {
    if (!(err instanceof APIError && err.code === ErrCode.NotFound)) log.warn(err, "the quote of a shipment's costs was not read", { quoteNumber });
    return null;
  }
}

const INVOICED_ROW = "This selling row is on an issued invoice — credit the invoice to change it";

/** A change of the row's place in the list only: it prints nothing different on an invoice. */
const onlyReorders = (input: SellingCostInput) =>
  Object.entries(input).every(([key, value]) => key === "sortOrder" || value === undefined);

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
      costsQuote: await costsQuoteOf(billingSettings?.quoteRef),
    };
  }

  // ── Buying costs: free lines of the Costs Breakdown ──
  // Once a shipment holds buying lines copied from a quote, the estimate is the quote's alone: a
  // line added by hand carries a real cost only (setsEstimate / quoteEstimateOnly).
  async addBuyingCost(shipmentId: string, companyId: string, input: BuyingCostInput, actorUserId = ""): Promise<InvoiceCostItem> {
    await assertNotBilled(shipmentId, companyId);
    const changes = buyingChanges(input);
    const values = { shipmentId, category: "", ...changes, ...receiptChanges(null, changes, new Date(), businessDay(new Date()), await payer(changes, actorUserId)) };
    await assertShipmentExists(shipmentId);
    await assertSupplierCompany(changes.supplierCustomerId, null);
    if (setsEstimate(values) && (await invoiceCostRepository.hasQuoteRows(companyId, shipmentId))) throw quoteEstimateOnly();
    return toCostItem(await invoiceCostRepository.createForCompany(companyId, values));
  }

  // A row copied from a quote keeps the quote's charge, words and estimate (QUOTE_FIXED_FIELDS):
  // a change to them is refused, the same value sent back with the rest of the row is not one.
  // Which quote a row came from is set when it is copied and never changes afterwards.
  async updateBuyingCost(id: string, companyId: string, shipmentId: string, input: BuyingCostInput, actorUserId = ""): Promise<InvoiceCostItem> {
    if (!leavesBuyingCostAlone(input)) await assertNotBilled(shipmentId, companyId);
    const changes = buyingChanges(input);
    const current = await invoiceCostRepository.findLine(id, companyId, shipmentId);
    if (!current) throw APIError.notFound("Buying cost not found");
    await assertSupplierCompany(changes.supplierCustomerId, current.supplierCustomerId);
    if (current.sourceQuoteNumber && quoteFixedChanged(current, changes).length) {
      throw APIError.failedPrecondition(`this cost was copied from ${current.sourceQuoteNumber}: its category, description and estimate stay as the quote has them`);
    }
    if (!current.sourceQuoteNumber && setsEstimate(changes) && (await invoiceCostRepository.hasQuoteRows(companyId, shipmentId))) throw quoteEstimateOnly();
    const now = new Date();
    const receipt = receiptChanges(current, changes, now, businessDay(now), await payer(changes, actorUserId));
    // Ticking Received is stamped by the database, from the row as it is when written: the line read above may
    // have been unticked meanwhile (C-5).
    const stamp = changes.received === true ? now : undefined;
    if (stamp) delete receipt.receivedAt;
    let row: InvoiceCostRecord | null;
    try {
      row = await invoiceCostRepository.updateLine(id, companyId, shipmentId, { ...changes, ...unlinkOnVendorChange(current, changes), ...receipt }, stamp);
    } catch (err) {
      // The database refused a paid day on a line someone unticked Received on meanwhile.
      if (constraintOf(err) === "invoice_cost_paid_check") throw APIError.failedPrecondition("Its invoice is no longer ticked Received: reload, then mark it paid again");
      throw err;
    }
    if (!row) throw APIError.notFound("Buying cost not found");
    return toCostItem(row);
  }

  // A row copied from a quote is not deleted: the estimate stays the quote's.
  async deleteBuyingCost(id: string, companyId: string, shipmentId: string): Promise<void> {
    await assertNotBilled(shipmentId, companyId);
    const current = await invoiceCostRepository.findLine(id, companyId, shipmentId);
    if (!current) throw APIError.notFound("Buying cost not found");
    if (current.sourceQuoteNumber) {
      throw APIError.failedPrecondition(`this cost was copied from ${current.sourceQuoteNumber}: it stays as the quote has it`);
    }
    if (!(await invoiceCostRepository.softDeleteLine(id, companyId, shipmentId))) throw APIError.notFound("Buying cost not found");
  }

  /**
   * Undo of a delete (C-6): the line comes back as it was - when its invoice was received, its payment and who
   * noted it - at `sortOrder` when given, not as a new line. One with an estimate of its own is refused once the
   * shipment's estimate is its quote's.
   */
  async restoreBuyingCost(id: string, companyId: string, shipmentId: string, sortOrder?: number): Promise<InvoiceCostItem> {
    await assertNotBilled(shipmentId, companyId);
    await assertShipmentExists(shipmentId);
    const deleted = await invoiceCostRepository.findDeletedLine(id, companyId, shipmentId);
    if (!deleted) throw APIError.notFound("Deleted buying cost not found");
    if (!deleted.sourceQuoteNumber && setsEstimate(deleted) && (await invoiceCostRepository.hasQuoteRows(companyId, shipmentId))) throw quoteEstimateOnly();
    const row = await invoiceCostRepository.restoreLine(id, companyId, shipmentId, sortOrder);
    if (!row) throw APIError.notFound("Deleted buying cost not found");
    return toCostItem(row);
  }

  /**
   * A buying cost posted by its charge code (master jobs, document reading). It goes onto the
   * shipment's first line of that code - so a real cost lands on the estimate it belongs to
   * instead of a second line - and a line is created when the shipment has none. On a billed
   * shipment (lib/billedLock) an estimate is not changed, and a real cost never replaces one the
   * line has already: the supplier's invoice comes as a new line.
   */
  async upsertCost(shipmentId: string, companyId: string, category: string, input: CategoryCostInput): Promise<InvoiceCostItem> {
    const code = toChargeCode(category);
    await assertNotKeptByTrucking(companyId, [shipmentId], code);
    const changes = buyingChanges(input);
    const billed = await isBilled(shipmentId, companyId);
    if (billed && (changes.estAmount !== undefined || changes.estCurrency !== undefined)) throw APIError.failedPrecondition(BILLED);
    // Checked again under the shipment's trucking-lines lock, so a Trucking push running at the
    // same moment can't slip its line in between the check and this write.
    return truckingLinesRepository.withShipmentLock(shipmentId, async () => {
      await assertNotKeptByTrucking(companyId, [shipmentId], code);
      const existing = await invoiceCostRepository.findByCategory(shipmentId, companyId, code);
      // On a shipment priced from a quote the real cost lands and the estimate stays the quote's.
      const quoted = existing?.sourceQuoteNumber || (await invoiceCostRepository.hasQuoteRows(companyId, shipmentId));
      const kept = quoted ? definedOnly({ ...changes, estAmount: undefined, estCurrency: undefined }) : changes;
      const posted = !!existing && (existing.realAmount !== null || !!existing.invoiceNumber.trim());
      if (existing && !(billed && posted)) {
        const row = await invoiceCostRepository.updateLine(existing.id, companyId, shipmentId, { ...kept, ...unlinkOnVendorChange(existing, kept) });
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
   * has a real cost of the code keeps it unless it is in `overwriteShipmentIds` - a billed one
   * keeps it whatever is asked (lib/billedLock), and says so; its part is not handed to the
   * others. `dryRun` only answers the split and what each shipment has.
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
      // A billed shipment's real cost stays: the part is not posted over it.
      const billed = await isBilled(line.shipmentId, companyId);
      const write = !input.dryRun && amount !== null && (!existing || (overwrite.has(line.shipmentId) && !billed));
      if (write) {
        await this.upsertCost(line.shipmentId, companyId, code, {
          realAmount: amount,
          realCurrency: input.currency,
          invoiceNumber: input.invoiceNumber.trim(),
          ...(input.vendor?.trim() ? { vendor: input.vendor.trim() } : {}),
        });
      }
      result.push({ shipmentId: line.shipmentId, amount, existing, written: write, billed });
    }
    return result;
  }

  /**
   * An invoice read line by line: each line on the shipment its B/L names, any other shared out. Per
   * shipment and charge its real cost goes onto the estimate it belongs to while that has no real cost
   * or invoice yet (a quote's estimate is then not counted beside it), else onto a new buying row, so a
   * second invoice never overwrites the first. A credit note is always a new row with the minus. The
   * same invoice number under the same charge would count twice: said, and refused unless allowed. A
   * master job's invoice only reaches the master job's live shipments (onMasterJob). A dry run makes
   * every check the post makes and writes nothing.
   */
  async postInvoiceLines(companyId: string, input: InvoiceLinesInput): Promise<InvoiceLinesRow[]> {
    const invoiceNumber = input.invoiceNumber.trim();
    if (!invoiceNumber) throw APIError.invalidArgument("the invoice number is missing");
    if (!input.lines.length) throw APIError.invalidArgument("the invoice has no lines");
    const creditNote = input.creditNote === true;
    let lines = input.lines.map((line) => {
      const label = line.item?.trim() || line.category || "A line";
      const ids = [line.shipmentId, ...(line.split ?? []).map((s) => s.shipmentId)].filter((id): id is string => id !== undefined);
      if (!ids.every(isUuid)) throw APIError.invalidArgument("shipmentId must be a shipment id");
      // "0x1F", "1e3" or a third decimal would be read as some other number than the one meant.
      return { ...line, amount: toDecimal(line.amount, `${label}: the amount`) ?? "" };
    });
    if (input.masterJobId !== undefined) {
      if (!isUuid(input.masterJobId)) throw APIError.invalidArgument("masterJobId must be a master job id");
      // Read as the caller: a master job that is not the company's is refused there.
      const { houses } = await shipments._internalMasterJobInvoiceHouses({ masterJobId: input.masterJobId });
      const placed = onMasterJob(lines, houses, input.splitMethod);
      if ("problem" in placed) throw APIError.invalidArgument(placed.problem);
      lines = placed.lines;
    } else if (lines.some((l) => !l.shipmentId)) {
      // Weights come from the master job's own data, so a line is only shared out over one.
      throw APIError.invalidArgument("A line without a shipment is shared over a master job's shipments: give the master job");
    }
    for (const line of lines) {
      const problem = invoiceLineProblem(line);
      if (problem) throw APIError.invalidArgument(problem);
    }
    const rows = invoiceRows(lines, { creditNote });
    const rowsProblem = invoiceRowsProblem(rows, { creditNote });
    if (rowsProblem) throw APIError.invalidArgument(rowsProblem);
    const shipmentIds = [...new Set(rows.map((r) => r.shipmentId))];
    for (const id of shipmentIds) await assertShipmentExists(id);
    const kept = async () => {
      for (const row of rows) await assertNotKeptByTrucking(companyId, [row.shipmentId], row.category);
    };
    // Checked first so nothing starts (and a dry run says it), and again under the shipments' locks:
    // a Trucking push can't slip in between.
    await kept();
    const key = (r: { shipmentId: string; category: string }) => `${r.shipmentId} ${r.category}`;
    const earlier = new Set((await invoiceCostRepository.ofInvoiceNumber(companyId, shipmentIds, invoiceNumber)).map(key));
    const repeatedRefusal = () => APIError.failedPrecondition(`${creditNote ? "Credit note" : "Invoice"} ${invoiceNumber} is already on one of these shipments under the same charge`);
    const answer = (ontoEstimate: boolean[]): InvoiceLinesRow[] =>
      rows.map((r, i) => ({ shipmentId: r.shipmentId, category: r.category, amount: r.amount, currency: r.currency, repeated: earlier.has(key(r)), ontoEstimate: ontoEstimate[i] ?? false }));
    if (input.dryRun) {
      const open = creditNote ? [] : await invoiceCostRepository.openEstimateRows(companyId, shipmentIds, [...new Set(rows.map((r) => r.category))]);
      return answer(ontoEstimates(rows, open).map((id) => id !== null));
    }
    if (earlier.size && rows.some((r) => earlier.has(key(r))) && !input.allowRepeat) throw repeatedRefusal();
    // The repeat is checked again under the locks, where two posts of one invoice wait for each other.
    const written = await invoiceCostRepository.addInvoiceRows(
      companyId,
      invoiceNumber,
      rows.map((r) => ({ shipmentId: r.shipmentId, category: r.category, description: r.description, realAmount: r.amount, realCurrency: r.currency })),
      { vendor: input.vendor?.trim() ?? "", fillEstimates: !creditNote, allowRepeat: input.allowRepeat === true, check: kept },
    );
    if (written === "repeated") throw repeatedRefusal();
    return answer(written.ontoEstimate);
  }

  // ── Selling costs ──
  // A billed shipment still takes selling rows (a late demurrage, storage): they go on its next
  // invoice. Only a row on an issued invoice is refused a change (lib/billedLock).
  async addSellingCost(shipmentId: string, companyId: string, input: SellingCostInput): Promise<SellingCostItem> {
    const values = { shipmentId, ...sellingChanges(input) };
    await assertShipmentExists(shipmentId);
    return toSellingItem(await sellingCostRepository.createForCompany(companyId, values));
  }

  async updateSellingCost(id: string, companyId: string, shipmentId: string, input: SellingCostInput, role?: string): Promise<SellingCostItem> {
    // A master job's demurrage taken off the invoice is sold for nothing: a manager's to do, as its
    // deletion is (asked for, then approved). A call from inside the app (no role) may.
    const mayUntickSplit = role === undefined || canDecideQuoteInquiry(role);
    if (input.invoice === false && !mayUntickSplit && (await sellingCostRepository.isSplitRow(id, companyId, shipmentId))) {
      throw APIError.permissionDenied("Only a manager can take a master job's demurrage off the invoice — ask for the row's deletion instead");
    }
    // A selling row on an issued invoice (not credited) is part of a tax document: it stays as it
    // was invoiced until the invoice is credited. Only its place in the list may move.
    const row = onlyReorders(input)
      ? await sellingCostRepository.updateLine(id, companyId, shipmentId, sellingChanges(input), { mayUntickSplit })
      : await sellingCostRepository.writeUnlessInvoiced(id, companyId, shipmentId, { data: sellingChanges(input) }, { mayUntickSplit });
    if (row === "invoiced") throw APIError.failedPrecondition(INVOICED_ROW);
    if (!row) throw APIError.notFound("Selling cost not found");
    return toSellingItem(row);
  }

  async deleteSellingCost(id: string, companyId: string, shipmentId: string): Promise<void> {
    const row = await sellingCostRepository.writeUnlessInvoiced(id, companyId, shipmentId, { delete: true });
    if (row === "invoiced") throw APIError.failedPrecondition(INVOICED_ROW);
    if (!row) throw APIError.notFound("Selling cost not found");
  }

  // ── Copy from a sales quote ──
  // Copies the cost lines of a sales quote into a shipment's Costs Breakdown, one row per line.
  // The lines are read from the quote as it is stored - under the whole reference, variant
  // suffix included: QCZ...-2 is another quote than QCZ... - and never from what a browser holds.
  // A quote is copied to a side once: a side holding its rows already is left (named in
  // alreadyCopied) while the other is still copied, and with nothing left to copy the copy is
  // refused; `force` copies it again. Copied selling rows are new rows,
  // so the invoice guard (rows already on an issued invoice) applies to them as to any other.
  async importQuote(
    shipmentId: string,
    companyId: string,
    quoteNumber: string,
    target: QuoteImportTarget,
    force: boolean,
  ): Promise<QuoteImportResult> {
    await assertShipmentExists(shipmentId);
    await assertNotBilled(shipmentId, companyId);
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
    // The revision of a Won quote stays Won while its prices are changed, so no send gate sees
    // them: costs below its floor are not copied until a manager approved them (Council Outlay 6).
    const wonRevision = typeof quote.data === "object" && quote.data !== null && "wonRevisionOf" in quote.data;
    if (wonRevision && quote.roadMargin?.needsApproval) throw APIError.failedPrecondition(`${quote.quoteNumber} - ${quote.sendBlocked ?? "its margin is below the floor and not approved"}`);
    // A job with a Trucking consignment gets its road freight from Trucking: the quote's trucking lines are left out.
    const skipTrucking = await truckingLinesRepository.hasConsignmentRows(companyId, shipmentId);
    const rows = quoteLinesToCostRows(quote.data, { skipTrucking });
    const buying = target === "sell" ? undefined : await withLiveSuppliers(rows.buying);
    // The copy makes the shipment's billing settings when it has none: billed in its customer's default.
    const billingCurrency = (await billingSettingsRepository.getByShipmentId(shipmentId, companyId))
      ? undefined
      : await startingBillingCurrency(companyId, shipmentId);
    const copied = await quoteCostImportRepository.copy(
      companyId,
      shipmentId,
      quote.quoteNumber,
      { buying, selling: target === "buy" ? undefined : rows.selling },
      force,
      billingCurrency,
    );
    // The details tell this refusal from the one above: copying again can be asked for.
    if (!copied) throw APIError.failedPrecondition(`costs from ${quote.quoteNumber} were already copied to this shipment`).withDetails({ alreadyCopied: true });
    return copied;
  }

  // ── Additional charges ──
  async addAdditionalCharge(shipmentId: string, companyId: string, input: AdditionalChargeInput): Promise<AdditionalChargeItem> {
    await assertNotBilled(shipmentId, companyId);
    const values = { shipmentId, ...chargeChanges(input) };
    await assertShipmentExists(shipmentId);
    return toChargeItem(await additionalChargeRepository.createForCompany(companyId, values));
  }

  async updateAdditionalCharge(id: string, companyId: string, shipmentId: string, input: AdditionalChargeInput): Promise<AdditionalChargeItem> {
    await assertNotBilled(shipmentId, companyId);
    const row = await additionalChargeRepository.updateForCompany(id, companyId, chargeChanges(input));
    if (!row || row.shipmentId !== shipmentId) throw APIError.notFound("Charge not found");
    return toChargeItem(row);
  }

  async deleteAdditionalCharge(id: string, companyId: string, shipmentId: string): Promise<void> {
    await assertNotBilled(shipmentId, companyId);
    const charge = await additionalChargeRepository.getByIdForCompany(id, companyId);
    if (!charge || charge.shipmentId !== shipmentId) throw APIError.notFound("Charge not found");
    await additionalChargeRepository.softDeleteForCompany(id, companyId);
  }

  // ── Billing ──
  /**
   * A shipment that got its customer (created with one, or linked to one) starts billing in the
   * customer's default currency: its billing settings are made with it, so the Costs Breakdown,
   * the invoice, the billing queue and the customer's totals all read the same currency. Only
   * while it has no billing settings and no invoice - a currency chosen or billed stays.
   */
  async startBilling(companyId: string, shipmentId: string): Promise<void> {
    if (await billingSettingsRepository.getByShipmentId(shipmentId, companyId)) return;
    const billingCurrency = await startingBillingCurrency(companyId, shipmentId);
    if (billingCurrency) await billingSettingsRepository.createIfMissing(shipmentId, companyId, { billingCurrency });
  }

  async upsertBillingSettings(shipmentId: string, companyId: string, input: BillingSettingsInput): Promise<BillingSettingsItem> {
    const roe = toDecimal(input.roe, "roe", 6);
    if (roe === null) throw APIError.invalidArgument("roe can't be cleared");
    const data = definedOnly({ ...input, roe });
    if (!(await billingSettingsRepository.getByShipmentId(shipmentId, companyId))) {
      await assertShipmentExists(shipmentId);
      // Made now for another field (the ROE): the currency starts as the customer's default too.
      if (data.billingCurrency === undefined) {
        const billingCurrency = await startingBillingCurrency(companyId, shipmentId);
        if (billingCurrency) data.billingCurrency = billingCurrency;
      }
    }
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
