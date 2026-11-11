import { createHash, randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { getAuthData } from "~encore/auth";
import { customers, fx, shipments } from "~encore/clients";
import { invoiceRepository, type InvoiceLineInput } from "../repositories/invoice.repository";
import { generatedInvoiceRepository } from "../repositories/generatedInvoice.repository";
import { invoiceProfileRepository } from "../repositories/invoiceProfile.repository";
import { sellingCostRepository } from "../repositories/sellingCost.repository";
import { truckingLinesLock, truckingLinesRepository } from "../repositories/truckingLines.repository";
import { billingSettingsRepository } from "../repositories/billingSettings.repository";
import type { CustomerSnapshot, InvoiceLineRecord, InvoiceRecord, ShipmentSnapshot, SupplierSnapshot } from "../schemas/invoice.schema";
import { missingForIssue, normaliseProfile } from "../lib/invoiceProfile";
import { invoiceSeriesPrefix, jobYear } from "../lib/invoiceNumber";
import {
  addDays,
  calculateInvoice,
  creditLines,
  creditTotals,
  defaultDuzp,
  dueDays,
  isIsoDate,
  type InvoiceCalc,
  type InvoiceLineCalc,
} from "../lib/invoiceCalc";
import type {
  BillingQueueCounts,
  BillingQueueItem,
  InvoiceDocItem,
  InvoiceDocLineItem,
  InvoicePartyItem,
  InvoicePreviewItem,
  QueueView,
} from "../interfaces/interfaces";
import { renderInvoicePdf, type InvoiceForPdf } from "../lib/invoicePdf";
import { loadPdfFonts } from "../lib/pdfFonts";
import { buildBillingQueue, countInvoicedLines, type QueueEntry } from "../lib/billingQueue";
import { invoiceBucket } from "../storage/invoiceBucket";
import { invoiceFollowupOutboxRepository } from "../repositories/invoiceFollowupOutbox.repository";
import { deliverInvoiceFollowups, followupsOfCreditNote, followupsOfInvoice, type FollowupActor } from "./invoiceFollowups.service";
import { isUniqueViolation } from "../../../lib/db/errors";
import { isUuid } from "../../../lib/uuid";

/**
 * Issuing tax documents. Everything is computed on the server from stored data: the
 * selling rows ticked for Invoice, the ČNB rates valid on the DUZP, the customer and
 * the issuer details. The browser only chooses the customer and the DUZP.
 */

export interface IssueParams {
  customerId?: string;
  duzp?: string;
  note?: string;
  idempotencyKey?: string;
}

/** Today in Prague - the issue date of a Czech invoice. */
export function pragueToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(now);
}

const lineItem = (l: InvoiceLineCalc): InvoiceDocLineItem => ({
  description: l.description,
  qty: l.qty.toFixed(2),
  unitPrice: l.unitPrice.toFixed(2),
  unitCurrency: l.unitCurrency,
  net: l.net.toFixed(2),
  vatCode: l.vatCode,
  vatRate: l.vatRate.toFixed(2),
  sourceSellingCostId: l.sourceSellingCostId,
});

/**
 * ČNB rates valid on the DUZP and the company ROE % then. The tax amounts need the fixing
 * of that day (or the one carried over a weekend / holiday), so a DUZP in the future or
 * today before the 15:00 pull cannot be invoiced yet.
 */
async function ratesForDuzp(duzp: string, today: string) {
  const r = await fx.fxRatesOn({ date: duzp });
  const rates: Record<string, number> = { CZK: 1, ...Object.fromEntries(r.rates.map((x) => [x.currency, x.rate])) };
  let problem = "";
  if (duzp > today) problem = "DUZP is in the future — the ČNB rate for it is not known yet";
  else if (r.provisional) problem = "Today's ČNB rate is imported at 15:00 (ČNB publishes about 14:30) — issue the invoice after that";
  // a fixing that should exist for the tax date was not imported: an older one would be the wrong tax rate
  else if (r.missing) problem = "ČNB rates for the tax date have not been imported yet — run Sync now on the Exchange page";
  else if (!r.fixingDate) problem = "No ČNB rates are stored — check the Exchange page";
  // currencies ČNB no longer publishes (BGN after 2025-12-31): only a line in one is refused
  const retired = new Map(r.retired.map((x) => [x.currency, x.lastFixingDate]));
  return { rates, fixingDate: r.fixingDate, roePct: r.roePct, retired, problem };
}

const supplierParty = (s: SupplierSnapshot): InvoicePartyItem => ({
  companyName: s.companyName, address: s.street, city: s.city, postalCode: s.postalCode, country: s.country, ico: s.ico, dic: s.dic,
});

// The customer as the invoice addresses it: at its Billing address when it has one, else at its seat.
const customerParty = (c: CustomerSnapshot): InvoicePartyItem => {
  const b = c.billingAddress;
  return b
    ? { companyName: c.companyName, address: b.street, city: b.city, postalCode: b.postalCode, country: b.country, ico: c.ico, dic: c.dic }
    : { companyName: c.companyName, address: c.address, city: c.city, postalCode: "", country: c.country, ico: c.ico, dic: c.dic };
};

export function toDocItem(inv: InvoiceRecord, lines: InvoiceLineRecord[]): InvoiceDocItem {
  return {
    id: inv.id,
    shipmentId: inv.shipmentId,
    kind: inv.kind,
    status: inv.status,
    number: inv.number,
    correctsInvoiceId: inv.correctsInvoiceId,
    creditReason: inv.creditReason,
    customerId: inv.customerId,
    issueDate: inv.issueDate,
    duzp: inv.duzp,
    dueDate: inv.dueDate,
    currency: inv.currency,
    fxRate: inv.fxRate,
    fxWeek: inv.fxWeek,
    fxFixingDate: inv.fxFixingDate,
    roePct: inv.roePct,
    net: inv.net,
    vat: inv.vat,
    gross: inv.gross,
    netCzk: inv.netCzk,
    vatCzk: inv.vatCzk,
    grossCzk: inv.grossCzk,
    vatSummary: inv.vatSummary,
    supplier: supplierParty(inv.supplier),
    customer: customerParty(inv.customer),
    jobNumber: inv.shipment.jobNumber,
    note: inv.note,
    hasPdf: !!inv.pdfKey,
    createdAt: inv.createdAt.toISOString(),
    lines: lines.map((l) => ({
      description: l.description,
      qty: l.qty,
      unitPrice: l.unitPrice,
      unitCurrency: l.unitCurrency,
      net: l.net,
      vatCode: l.vatCode,
      vatRate: l.vatRate,
      sourceSellingCostId: l.sourceSellingCostId,
    })),
  };
}

/** Everything a draft or an issued invoice is built from. */
async function loadContext(shipmentId: string, companyId: string, params: IssueParams) {
  const { shipment } = await shipments.shipmentGet({ shipmentId });
  const profileRow = await invoiceProfileRepository.getByCompany(companyId);
  const profile = profileRow ? normaliseProfile(profileRow) : null;
  const [allRows, settings, alreadyInvoiced] = await Promise.all([
    sellingCostRepository.listByShipmentId(shipmentId, companyId),
    billingSettingsRepository.getByShipmentId(shipmentId, companyId),
    invoiceRepository.invoicedSellingRowIds(shipmentId, companyId),
  ]);
  // A row on an issued, not credited invoice is billed already; after a credit note it is open again.
  const rows = allRows.filter((r) => !alreadyInvoiced.has(r.id));

  const problems: string[] = [];
  const issueDate = pragueToday();
  const duzp = params.duzp?.trim() || defaultDuzp(shipment, issueDate);
  if (!isIsoDate(duzp)) problems.push("DUZP is not a valid date");

  const customerId = params.customerId || shipment.customerId || null;
  let customer: CustomerSnapshot | null = null;
  if (!customerId) {
    problems.push("Choose the customer to invoice");
  } else {
    try {
      const { customer: c } = await customers.customerGet({ id: customerId });
      customer = {
        customerId: c.id,
        companyName: c.companyName,
        address: c.registeredAddress,
        city: c.city,
        country: c.country,
        ico: c.ico,
        dic: c.dic,
        paymentTerms: c.paymentTerms,
      };
    } catch (err) {
      log.warn("invoice customer lookup failed", { customerId, error: err instanceof Error ? err.message : String(err) });
      problems.push("The chosen customer was not found");
    }
    // The customer's Billing address (one at most), printed instead of the seat. Not knowing it
    // blocks issuing: the invoice would go to the seat without anybody noticing.
    if (customer) {
      try {
        const { data: addresses } = await customers.addressList({ customerId });
        const billing = addresses.find((a) => a.types.includes("Billing"));
        if (billing) {
          customer.billingAddress = { label: billing.label, street: billing.street, postalCode: billing.postalCode, city: billing.city, country: billing.country };
        }
      } catch (err) {
        log.warn("invoice customer addresses lookup failed", { customerId, error: err instanceof Error ? err.message : String(err) });
        problems.push("The customer's billing address could not be read — try again");
      }
    }
  }

  if (!profile) problems.push("Fill in the invoicing details under Settings → Organization");
  else {
    const missing = missingForIssue(profile);
    if (missing.length) problems.push(`Invoicing details are missing: ${missing.join(", ")} (Settings → Organization)`);
  }

  const currency = settings?.billingCurrency || "CZK";
  // Not a block: the invoice is issued all the same, only without payment details in that currency.
  const warnings: string[] = [];
  if (profile && !profile.bankAccounts.some((a) => a.currency === currency)) {
    warnings.push(`No bank account in ${currency} (Settings → Organization): the invoice has no payment details or QR payment`);
  }
  const picked = await ratesForDuzp(isIsoDate(duzp) ? duzp : issueDate, issueDate);
  // The ČNB rate of the tax date only matters when something is converted: a CZK invoice of CZK
  // rows needs none, so it is not held for the 15:00 import or a fixing that is missing.
  const converts = currency !== "CZK" || rows.some((r) => r.invoice && (r.currency || currency).toUpperCase() !== "CZK");
  if (picked.problem && converts) problems.push(picked.problem);
  const calc = calculateInvoice({
    rows: rows.map((r) => ({
      // the selling row's "customer" column is the line's own text (Issue invoice); else its Description is printed
      id: r.id, category: r.category, invoiceText: r.customer, description: r.description, qty: r.qty, amount: r.amount, currency: r.currency, invoice: r.invoice, vatCode: r.vatCode,
    })),
    currency,
    rates: picked.rates,
    roePct: picked.roePct,
    tradeDirection: shipment.tradeDirection,
    vatPayer: profile?.vatPayer ?? true,
    customer: customer ? { country: customer.country, dic: customer.dic } : null,
  });
  for (const c of calc.missingCurrencies) {
    const last = picked.retired.get(c);
    problems.push(last
      ? `ČNB no longer publishes ${c} (last fixing ${last}) — change the currency of the ${c} selling rows`
      : `ČNB publishes no rate for ${c}`);
  }
  if (calc.lines.length === 0) {
    problems.push(alreadyInvoiced.size ? "Every ticked selling row is invoiced already" : "Tick at least one selling row for Invoice");
  }
  else if (calc.gross <= 0) problems.push("The invoice total must be above zero");

  const dueDate = addDays(issueDate, dueDays(customer?.paymentTerms, profile?.defaultDueDays ?? 14));
  // When each row the lines are built from was last changed: issuing checks them again under its lock.
  const versions = new Map(rows.map((r) => [r.id, r.updatedAt.getTime()]));
  // What the invoice names besides the job: the quote its prices come from - the quote(s) the
  // billed rows were copied from, else the one last copied into the costs, else the job's Sales
  // Number - and from where to where the cargo goes.
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const billedQuotes = [...new Set(calc.lines.map((l) => rowById.get(l.sourceSellingCostId)?.sourceQuoteNumber?.trim() ?? "").filter(Boolean))];
  const quoteNumber = billedQuotes.join(", ") || settings?.quoteRef?.trim() || shipment.salesNumber?.trim() || "";
  const routeFrom = shipment.pol?.trim() || shipment.origin?.trim() || "";
  const routeTo = shipment.pod?.trim() || shipment.destination?.trim() || "";
  return { shipment, profile, customer, customerId, issueDate, duzp, dueDate, calc, picked, problems, warnings, versions, quoteNumber, routeFrom, routeTo };
}

function supplierSnapshot(profile: NonNullable<Awaited<ReturnType<typeof loadContext>>["profile"]>, currency: string): SupplierSnapshot {
  return {
    companyName: profile.companyName,
    street: profile.street,
    city: profile.city,
    postalCode: profile.postalCode,
    country: profile.country,
    ico: profile.ico,
    dic: profile.dic,
    vatPayer: profile.vatPayer,
    registerEntry: profile.registerEntry,
    email: profile.email,
    phone: profile.phone,
    web: profile.web,
    logoData: profile.logoData,
    footerNote: profile.footerNote,
    bankAccount: profile.bankAccounts.find((a) => a.currency === currency) ?? null,
  };
}

const lineRows = (lines: InvoiceLineCalc[]): InvoiceLineInput[] =>
  lines.map((l, i) => ({
    seq: i + 1,
    description: l.description,
    qty: l.qty.toFixed(2),
    unitPrice: l.unitPrice.toFixed(2),
    unitCurrency: l.unitCurrency,
    net: l.net.toFixed(2),
    vatCode: l.vatCode,
    vatRate: l.vatRate.toFixed(2),
    sourceSellingCostId: l.sourceSellingCostId,
    fxRate: String(l.fxRate),
  }));

const money = (calc: Pick<InvoiceCalc, "net" | "vat" | "gross" | "netCzk" | "vatCzk" | "grossCzk">) => ({
  net: calc.net.toFixed(2),
  vat: calc.vat.toFixed(2),
  gross: calc.gross.toFixed(2),
  netCzk: calc.netCzk.toFixed(2),
  vatCzk: calc.vatCzk.toFixed(2),
  grossCzk: calc.grossCzk.toFixed(2),
});

// Who an issued document's follow-ups are sent as: the user who issued it, with their role then.
function actorOf(userId: string): FollowupActor {
  return { userId, role: getAuthData()?.role ?? "" };
}

/**
 * The document a retried request (same idempotency key) already made. The key must have been
 * used for the same kind of document on the same shipment / invoice; anything else means the
 * key was reused by mistake, and returning that other document would be wrong.
 */
async function replayed(companyId: string, key: string, matches: (r: InvoiceRecord) => boolean): Promise<InvoiceDocItem | null> {
  const existing = await invoiceRepository.getByIdempotencyKey(companyId, key);
  if (!existing) return null;
  if (!matches(existing)) throw APIError.alreadyExists("This request was already used for another document — reload and try again");
  return toDocItem(existing, await invoiceRepository.getLines(existing.id, companyId));
}

/**
 * Runs an issue; when a retry with the same key raced it and won, its document is returned
 * instead of the unique-key error.
 */
async function issueOnce(
  companyId: string,
  key: string | null,
  matches: (r: InvoiceRecord) => boolean,
  issue: () => Promise<InvoiceDocItem>,
): Promise<InvoiceDocItem> {
  if (key) {
    const earlier = await replayed(companyId, key, matches);
    if (earlier) return earlier;
  }
  try {
    return await issue();
  } catch (err) {
    if (key && isUniqueViolation(err)) {
      const winner = await replayed(companyId, key, matches);
      if (winner) return winner;
    }
    throw err;
  }
}

export interface InvoicePdfFile {
  fileName: string;
  contentBase64: string;
  sha256: string;
}

async function pdfInput(inv: InvoiceRecord, lines: InvoiceLineRecord[], companyId: string): Promise<InvoiceForPdf> {
  const corrected = inv.correctsInvoiceId ? await invoiceRepository.getByIdForCompany(inv.correctsInvoiceId, companyId) : null;
  return {
    kind: inv.kind,
    number: inv.number,
    issueDate: inv.issueDate,
    duzp: inv.duzp,
    dueDate: inv.dueDate,
    currency: inv.currency,
    fxRate: inv.fxRate,
    fxWeek: inv.fxWeek,
    fxFixingDate: inv.fxFixingDate,
    roePct: inv.roePct,
    net: inv.net,
    vat: inv.vat,
    gross: inv.gross,
    netCzk: inv.netCzk,
    vatCzk: inv.vatCzk,
    grossCzk: inv.grossCzk,
    vatSummary: inv.vatSummary,
    supplier: inv.supplier,
    customer: inv.customer,
    shipment: inv.shipment,
    note: inv.note,
    creditReason: inv.creditReason,
    correctsNumber: corrected?.number ?? "",
    lines: lines.map((l) => ({
      description: l.description, qty: l.qty, unitPrice: l.unitPrice, unitCurrency: l.unitCurrency,
      net: l.net, vatCode: l.vatCode, vatRate: l.vatRate,
    })),
  };
}

/**
 * Renders the PDF from the stored snapshot and keeps it as the official copy. When two
 * requests race, the first stored file wins and the other upload is removed.
 */
async function storePdf(inv: InvoiceRecord, lines: InvoiceLineRecord[], companyId: string): Promise<Buffer> {
  const bytes = Buffer.from(await renderInvoicePdf(await pdfInput(inv, lines, companyId), await loadPdfFonts()));
  const key = `${companyId}/${inv.number}-${randomUUID()}.pdf`;
  await invoiceBucket.upload(key, bytes, { contentType: "application/pdf" });
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (await invoiceRepository.setPdfIfMissing(inv.id, companyId, key, sha)) return bytes;

  await invoiceBucket.remove(key).catch((err) => log.warn("could not remove a duplicate invoice PDF upload", { key, error: String(err) }));
  const winner = await invoiceRepository.getByIdForCompany(inv.id, companyId);
  return invoiceBucket.download(winner!.pdfKey);
}

/**
 * Right after issuing: store the PDF, but never fail the issue because of it (it is made
 * on the first download then). Returns whether a PDF is stored.
 */
async function storePdfQuietly(inv: InvoiceRecord, lines: InvoiceLineRecord[], companyId: string): Promise<boolean> {
  try {
    await storePdf(inv, lines, companyId);
    return true;
  } catch (err) {
    log.error(err, "could not store the invoice PDF; it will be made on first download", { number: inv.number });
    return false;
  }
}

/** Queue views and the shipments-list filter behind each. */
export const QUEUE_VIEWS: Record<QueueView, string> = { all: "all", to_bill: "billing", not_invoiced: "not-invoiced", invoiced: "invoiced", unbilled_arrivals: "unbilled-arrivals" };

/** How many shipments one queue view shows at most (shipments are fetched 200 per page). */
const QUEUE_MAX = 1000;

class InvoiceDocumentService {
  async preview(shipmentId: string, companyId: string, params: IssueParams): Promise<InvoicePreviewItem> {
    const ctx = await loadContext(shipmentId, companyId, params);
    return {
      customerId: ctx.customerId,
      customer: ctx.customer ? customerParty(ctx.customer) : null,
      billingAddress: !!ctx.customer?.billingAddress,
      // The issuer and the account the invoice is paid to, so a wrong one is seen before issuing.
      issuer: ctx.profile ? supplierParty(supplierSnapshot(ctx.profile, ctx.calc.currency)) : null,
      bankAccount: ctx.profile ? supplierSnapshot(ctx.profile, ctx.calc.currency).bankAccount : null,
      quoteNumber: ctx.quoteNumber,
      routeFrom: ctx.routeFrom,
      routeTo: ctx.routeTo,
      issueDate: ctx.issueDate,
      duzp: ctx.duzp,
      dueDate: ctx.dueDate,
      currency: ctx.calc.currency,
      fxRate: ctx.calc.fxRate,
      fxFixingDate: ctx.picked.fixingDate,
      roePct: ctx.picked.roePct,
      net: ctx.calc.net,
      vat: ctx.calc.vat,
      gross: ctx.calc.gross,
      netCzk: ctx.calc.netCzk,
      vatCzk: ctx.calc.vatCzk,
      grossCzk: ctx.calc.grossCzk,
      vatSummary: ctx.calc.vatSummary,
      lines: ctx.calc.lines.map(lineItem),
      problems: ctx.problems,
      warnings: ctx.warnings,
    };
  }

  async issue(shipmentId: string, companyId: string, userId: string, params: IssueParams): Promise<InvoiceDocItem> {
    const key = params.idempotencyKey?.trim() || null;
    const sameRequest = (r: InvoiceRecord) => r.kind === "invoice" && r.shipmentId === shipmentId;
    return issueOnce(companyId, key, sameRequest, async () => {
      const ctx = await loadContext(shipmentId, companyId, params);
      if (ctx.problems.length) throw APIError.failedPrecondition(ctx.problems.join("; "));

      // The invoice number carries the job's Internal Reference, so from here on the reference is
      // final. Shipments marks it so under the shipment's write turn and gives it back as it is now:
      // an edit of the job's Freight Mode or Load Type made meanwhile renamed it before, or keeps it.
      const { jobNumber } = await shipments._internalShipmentReferenceFinal({ shipmentId });
      const shipmentSnapshot: ShipmentSnapshot = {
        jobNumber,
        jobYear: jobYear(ctx.shipment.createdAt),
        tradeDirection: ctx.shipment.tradeDirection,
        shipper: ctx.shipment.shipper,
        consignee: ctx.shipment.consignee,
        bookingNumber: ctx.shipment.bookingNumber,
        containerNumber: ctx.shipment.containerNumber,
        personalReference: ctx.shipment.personalReference,
        routeFrom: ctx.routeFrom,
        routeTo: ctx.routeTo,
        quoteNumber: ctx.quoteNumber,
      };
      const billed = ctx.calc.lines.map((l) => l.sourceSellingCostId);
      const { invoice, lines } = await invoiceRepository.issue(
        invoiceSeriesPrefix("INV", shipmentSnapshot.jobYear, shipmentSnapshot.jobNumber),
        {
          companyId,
          shipmentId,
          kind: "invoice",
          status: "issued",
          customerId: ctx.customer!.customerId,
          issueDate: ctx.issueDate,
          duzp: ctx.duzp,
          dueDate: ctx.dueDate,
          currency: ctx.calc.currency,
          fxRate: String(ctx.calc.fxRate),
          fxWeek: "",
          fxFixingDate: ctx.picked.fixingDate,
          fxSource: "CNB",
          roePct: String(ctx.picked.roePct),
          ...money(ctx.calc),
          vatSummary: ctx.calc.vatSummary,
          supplier: supplierSnapshot(ctx.profile!, ctx.calc.currency),
          customer: ctx.customer!,
          shipment: shipmentSnapshot,
          note: params.note?.trim() ?? "",
          issuedBy: userId,
          idempotencyKey: key,
        },
        lineRows(ctx.calc.lines),
        {
          // Two invoices of one job share the series lock: whatever the other one billed while
          // this one was being prepared is checked again here, so no row is billed twice.
          // The shipment's Trucking push takes the same trucking-lines lock: a push that replaced
          // the rows while this invoice was prepared is seen here, so freight is never billed from
          // rows that were just replaced (and then billed again from the new ones).
          beforeInsert: async (tx) => {
            await truckingLinesLock(tx, shipmentId);
            const taken = await invoiceRepository.invoicedSellingRowIds(shipmentId, companyId, tx);
            if (billed.some((id) => taken.has(id))) {
              throw APIError.failedPrecondition("Some of these selling rows were invoiced a moment ago — reload and check the invoice");
            }
            // A row saved while this invoice was being prepared (its saves take the same lock) would
            // be billed with its old values and then locked with the new ones: refused, to reload.
            const sourceIds = billed.filter((id): id is string => !!id);
            const live = await truckingLinesRepository.liveSellingVersions(tx, companyId, shipmentId, sourceIds);
            if (sourceIds.some((id) => !live.has(id) || live.get(id) !== ctx.versions.get(id))) {
              throw APIError.failedPrecondition("Some of these selling rows were changed a moment ago — reload and check the invoice");
            }
          },
          // What the invoice owes the customer's list and the shipment's statuses commits with it.
          afterInsert: async (tx, inserted) => {
            await invoiceFollowupOutboxRepository.enqueue(tx, followupsOfInvoice(inserted, actorOf(userId)));
          },
        },
      );
      // Sent straight away; what a service does not take now is sent again by the followups cron.
      await deliverInvoiceFollowups(invoice.id);
      const stored = await storePdfQuietly(invoice, lines, companyId);
      return { ...toDocItem(invoice, lines), hasPdf: stored };
    });
  }

  /**
   * Credit note (opravný daňový doklad, §45): reverses the whole original invoice with the
   * same rates and VAT codes, numbered CN + job year + job number + sequence.
   */
  async credit(invoiceId: string, companyId: string, userId: string, reason: string, idempotencyKey?: string): Promise<InvoiceDocItem> {
    const key = idempotencyKey?.trim() || null;
    const sameRequest = (r: InvoiceRecord) => r.kind === "credit_note" && r.correctsInvoiceId === invoiceId;
    return issueOnce(companyId, key, sameRequest, async () => {
      if (!reason.trim()) throw APIError.invalidArgument("Give the reason for the credit note");

      const original = await invoiceRepository.getByIdForCompany(invoiceId, companyId);
      if (!original) throw APIError.notFound("Invoice not found");
      if (original.kind !== "invoice") throw APIError.failedPrecondition("A credit note cannot be credited");
      if (original.status !== "issued") throw APIError.failedPrecondition(`Invoice ${original.number} has already been credited`);

      const originalLines = await invoiceRepository.getLines(original.id, companyId);
      const calcLines: InvoiceLineCalc[] = creditLines(
        originalLines.map((l) => ({
          sourceSellingCostId: l.sourceSellingCostId ?? "",
          description: l.description,
          qty: Number(l.qty),
          unitPrice: Number(l.unitPrice),
          unitCurrency: l.unitCurrency,
          net: Number(l.net),
          vatCode: l.vatCode,
          vatRate: Number(l.vatRate),
          fxRate: Number(l.fxRate ?? 1),
        })),
      );
      // §42 ZDPH: a correction uses the rate of the original supply — and the credit note must
      // cancel the invoice exactly, so its totals are the invoice's own, negated.
      const totals = creditTotals(original);
      const issueDate = pragueToday();

      const { invoice, lines } = await invoiceRepository.issue(
        // the credit note belongs to the same job and job year as the invoice it corrects
        invoiceSeriesPrefix("CN", original.shipment.jobYear, original.shipment.jobNumber),
        {
          companyId,
          shipmentId: original.shipmentId,
          kind: "credit_note",
          status: "issued",
          correctsInvoiceId: original.id,
          creditReason: reason.trim(),
          customerId: original.customerId,
          issueDate,
          // DUZP of a credit note = the date it is issued (§42 ZDPH)
          duzp: issueDate,
          dueDate: issueDate,
          currency: original.currency,
          fxRate: original.fxRate,
          fxWeek: original.fxWeek,
          fxFixingDate: original.fxFixingDate,
          fxSource: original.fxSource,
          roePct: original.roePct,
          ...money(totals),
          vatSummary: totals.vatSummary,
          supplier: original.supplier,
          customer: original.customer,
          shipment: original.shipment,
          note: "",
          issuedBy: userId,
          idempotencyKey: key,
        },
        lineRows(calcLines).map((l) => ({ ...l, sourceSellingCostId: l.sourceSellingCostId || null })),
        {
          afterInsert: async (tx, inserted) => {
            const ok = await invoiceRepository.markCredited(tx, original.id, companyId);
            if (!ok) throw APIError.failedPrecondition(`Invoice ${original.number} has already been credited`);
            await invoiceFollowupOutboxRepository.enqueue(tx, followupsOfCreditNote(inserted, original, actorOf(userId)));
          },
        },
      );
      // Sent straight away; what a service does not take now is sent again by the followups cron.
      await deliverInvoiceFollowups(invoice.id);
      const stored = await storePdfQuietly(invoice, lines, companyId);
      return { ...toDocItem(invoice, lines), hasPdf: stored };
    });
  }

  /**
   * Of the shipments, those an invoice was ever issued for - a credited one too, and one the old
   * generator made: their numbers carry the job's Internal Reference, which is final from then on.
   */
  async shipmentsEverInvoiced(shipmentIds: string[], companyId: string): Promise<string[]> {
    const ids = shipmentIds.filter(isUuid);
    const [issued, generated] = await Promise.all([
      invoiceRepository.shipmentIdsWithInvoices(ids, companyId),
      generatedInvoiceRepository.shipmentIdsWithInvoices(ids, companyId),
    ]);
    return [...new Set([...issued, ...generated])];
  }

  /** Issued, not credited invoices of a job (its tax date is final while there is one). */
  async openInvoiceCount(shipmentId: string, companyId: string): Promise<number> {
    return invoiceRepository.countOpenInvoices(shipmentId, companyId);
  }

  /** The official PDF: the stored copy, or made and stored now if issuing could not store it. */
  async pdf(id: string, companyId: string): Promise<InvoicePdfFile> {
    const row = await invoiceRepository.getByIdForCompany(id, companyId);
    if (!row) throw APIError.notFound("Invoice not found");
    let bytes: Buffer | null = null;
    if (row.pdfKey) {
      try {
        bytes = await invoiceBucket.download(row.pdfKey);
      } catch (err) {
        log.error(err, "stored invoice PDF is missing", { number: row.number });
        throw APIError.internal(`The stored PDF of ${row.number} could not be read`);
      }
    } else {
      bytes = await storePdf(row, await invoiceRepository.getLines(row.id, companyId), companyId);
    }
    return {
      fileName: `${row.number}.pdf`,
      contentBase64: bytes.toString("base64"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }

  /**
   * The Invoicing queue. Which shipments are listed comes from the shipment itself
   * (owner's decision): "All shipments" = the jobs released for billing (Shipment Status Billing)
   * or invoiced, cancelled ones left out; "To bill" = Shipment Status Billing, not invoiced yet;
   * "Not invoiced" / "Invoiced" = Invoicing Status. The selling lines add the amount still to bill
   * and the invoices issued.
   */
  async queue(
    companyId: string,
    view: QueueView,
    search?: string,
  ): Promise<{ queue: BillingQueueItem[]; counts: BillingQueueCounts; truncated: boolean }> {
    const q = search?.trim() || undefined;
    const countOf = async (filter: string) => (await shipments.shipmentList({ invoicing: filter, search: q, limit: 1 })).pagination.total;

    // The shipments of this view, 200 per page (the list endpoint's maximum), newest first: past
    // QUEUE_MAX it is the oldest jobs that are left out (the client is told), never the latest.
    const listed: Awaited<ReturnType<typeof shipments.shipmentList>>["data"] = [];
    let total = 0;
    do {
      const page = await shipments.shipmentList({ invoicing: QUEUE_VIEWS[view], search: q, limit: 200, offset: listed.length, sortDirection: "desc" });
      total = page.pagination.total;
      listed.push(...page.data);
      if (page.data.length === 0) break;
    } while (listed.length < total && listed.length < QUEUE_MAX);
    // Shown oldest first, as before.
    listed.reverse();

    const [rows, openInvoices, settings, today, all, toBill, notInvoiced, invoiced, unbilledArrivals] = await Promise.all([
      sellingCostRepository.listLiveByCompany(companyId),
      invoiceRepository.listOpenInvoicesWithSources(companyId),
      billingSettingsRepository.listByCompany(companyId),
      ratesForDuzp(pragueToday(), pragueToday()),
      countOf(QUEUE_VIEWS.all),
      countOf(QUEUE_VIEWS.to_bill),
      countOf(QUEUE_VIEWS.not_invoiced),
      countOf(QUEUE_VIEWS.invoiced),
      countOf(QUEUE_VIEWS.unbilled_arrivals),
    ]);
    const settingsById = new Map(settings.map((x) => [x.shipmentId, x.billingCurrency]));
    // The DUZP of each job's newest open invoice (the highest number).
    const invoiceDuzp = new Map<string, { number: string; duzp: string }>();
    for (const i of openInvoices) {
      const seen = invoiceDuzp.get(i.shipmentId);
      if (!seen || i.number > seen.number) invoiceDuzp.set(i.shipmentId, { number: i.number, duzp: i.duzp });
    }
    const todayIso = pragueToday();
    const lineCounts = countInvoicedLines(rows, openInvoices);
    const billing = new Map<string, QueueEntry>(
      buildBillingQueue({ rows: rows.filter((r) => r.invoice), openInvoices, billingCurrencies: settingsById, rates: today.rates, roePct: today.roePct }).map((e) => [e.shipmentId, e]),
    );

    const queue: BillingQueueItem[] = listed.map((s) => {
      const b = billing.get(s.id);
      return {
        shipmentId: s.id,
        jobNumber: s.jobNumber,
        customer: s.customer,
        shipper: s.shipper,
        consignee: s.consignee,
        customerId: s.customerId ?? null,
        department: s.department ?? "",
        houseBolType: s.houseBolType ?? "",
        masterBolType: s.masterBolType ?? "",
        tradeDirection: s.tradeDirection,
        estimatedDeparture: s.estimatedDeparture,
        estimatedArrival: s.estimatedArrival,
        duzp: invoiceDuzp.get(s.id)?.duzp ?? defaultDuzp(s, todayIso),
        shipmentStatus: s.status ?? "",
        invoicingStatus: s.invoicingStatus,
        billingState: b?.status ?? "none",
        billingCurrency: b?.billingCurrency ?? settingsById.get(s.id) ?? "CZK",
        amountToBill: b?.amountToBill ?? 0,
        rowsToBill: b?.rowsToBill ?? 0,
        missingCurrencies: b?.missingCurrencies ?? [],
        invoiceNumbers: b?.invoiceNumbers ?? [],
        invoiced: b?.invoiced ?? [],
        sellingLines: lineCounts.get(s.id)?.total ?? 0,
        invoicedLines: lineCounts.get(s.id)?.invoiced ?? 0,
      };
    });
    return { queue, counts: { all, toBill, notInvoiced, invoiced, unbilledArrivals }, truncated: total > listed.length };
  }

  async list(shipmentId: string, companyId: string): Promise<InvoiceDocItem[]> {
    const rows = await invoiceRepository.listByShipment(shipmentId, companyId);
    return Promise.all(rows.map(async (r) => toDocItem(r, await invoiceRepository.getLines(r.id, companyId))));
  }

  async get(id: string, companyId: string): Promise<InvoiceDocItem> {
    const row = await invoiceRepository.getByIdForCompany(id, companyId);
    if (!row) throw APIError.notFound("Invoice not found");
    return toDocItem(row, await invoiceRepository.getLines(row.id, companyId));
  }
}

export const invoiceDocumentService = new InvoiceDocumentService();
