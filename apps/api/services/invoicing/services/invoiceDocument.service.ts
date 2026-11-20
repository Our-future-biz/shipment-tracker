import { createHash, randomUUID } from "node:crypto";
import { APIError, ErrCode } from "encore.dev/api";
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
import { customerIssueWarnings } from "../lib/issueWarnings";
import { invoiceSeriesPrefix, jobYear } from "../lib/invoiceNumber";
import {
  addDays,
  calculateInvoice,
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
  SearchInvoicesResponse,
} from "../interfaces/interfaces";
import { renderInvoicePdf, type InvoiceForPdf } from "../lib/invoicePdf";
import { loadPdfFonts } from "../lib/pdfFonts";
import { buildBillingQueue, countCreditsOwed, countInvoicedLines, type QueueEntry } from "../lib/billingQueue";
import type { ChargeCount } from "../lib/shipmentStatus";
import { invoiceBucket } from "../storage/invoiceBucket";
import { BILLING_CURRENCY_UNKNOWN, startBilling } from "./billingStart.service";
import { invoiceFollowupOutboxRepository } from "../repositories/invoiceFollowupOutbox.repository";
import {
  chargeCountOf,
  deliverInvoiceFollowups,
  followupsOfCreditNote,
  followupsOfInvoice,
  followupsOfCancellation,
  followupsOfPartialCreditNote,
  type FollowupActor,
} from "./invoiceFollowups.service";
import {
  fullCreditLines,
  fullCreditTotalsAfter,
  partialCreditTotals,
  planPartialCredit,
  remainingLines,
  sameCreditsOwed,
  settleTruckingCredit,
  type CreditLineCalc,
  type RemainingLine,
} from "../lib/partialCredit";
import { creditNoteRequestRepository } from "../repositories/creditNoteRequest.repository";
import { invoiceChangeRequestRepository } from "../repositories/invoiceChangeRequest.repository";
import type { InvoiceChangeRequestRecord } from "../schemas/invoiceChangeRequest.schema";
import { db } from "../db/db";
import type { CreditNoteRequestRecord } from "../schemas/creditNoteRequest.schema";
import { userEmailOf } from "../../../lib/companyUsers";
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
  /** The total with VAT the user confirmed (the preview's gross): issuing refuses another one. */
  expectedGross?: number;
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
      id: l.id,
      correctsLineId: l.correctsLineId ?? null,
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
  const [allRows, storedSettings, alreadyInvoiced] = await Promise.all([
    sellingCostRepository.listByShipmentId(shipmentId, companyId),
    billingSettingsRepository.getByShipmentId(shipmentId, companyId),
    invoiceRepository.invoicedSellingRowIds(shipmentId, companyId),
  ]);
  // A job whose billing never started (its customer could not be read then) starts it now, in the
  // customer's default currency: an invoice is never drawn up in CZK only because of that.
  let settings = storedSettings;
  let currencyUnknown = false;
  if (!settings) {
    try {
      await startBilling(companyId, shipmentId);
      settings = await billingSettingsRepository.getByShipmentId(shipmentId, companyId);
    } catch (err) {
      log.warn(err, "the shipment's billing could not be started before the invoice", { shipmentId });
      currencyUnknown = true;
    }
  }
  // A row on an issued, not credited invoice is billed already; after a credit note it is open again.
  const rows = allRows.filter((r) => !alreadyInvoiced.has(r.id));

  const problems: string[] = [];
  if (currencyUnknown) problems.push(BILLING_CURRENCY_UNKNOWN);
  const issueDate = pragueToday();
  const duzp = params.duzp?.trim() || defaultDuzp(shipment, issueDate);
  if (!isIsoDate(duzp)) problems.push("DUZP is not a valid date");

  const customerId = params.customerId || shipment.customerId || null;
  let customer: CustomerSnapshot | null = null;
  // What the customer may be billed in, for the preview's currency picker (not part of the invoice).
  let customerCurrencies: InvoicePreviewItem["customerCurrencies"] = null;
  // Its status in the Customer Database, for the warnings below (not part of the invoice).
  let customerStatus = "";
  if (!customerId) {
    problems.push("Choose the customer to invoice");
  } else {
    try {
      const { customer: c } = await customers.customerGet({ id: customerId });
      customerCurrencies = { currency: c.currency, secondaryCurrencies: c.secondaryCurrencies };
      customerStatus = c.status;
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
      // Only Customers' own answer says the customer is gone; Customers down or slow is no reason to
      // pick another customer, only to try again.
      problems.push(err instanceof APIError && err.code === ErrCode.NotFound
        ? "The chosen customer was not found"
        : "The customer could not be read — try again");
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
  // The customer's DIČ and its status: warned of, never a block (user council B6).
  warnings.push(...customerIssueWarnings(customer && { dic: customer.dic, country: customer.country, status: customerStatus }));
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
  // What is left is a credit owed (a Trucking price lowered after the invoice, a discount added late):
  // it is given on a credit note of the invoice, which settles it (Y1 / P1) - any line below nothing on
  // no invoice, not only Trucking's (truckingLinesRepository openCreditDiffs), so the line never comes
  // off the next invoice as well.
  else if (calc.gross <= 0) problems.push(alreadyInvoiced.size ? "The invoice total must be above zero: what is left is a credit - give it on a credit note of the invoice" : "The invoice total must be above zero");

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
  return { shipment, profile, customer, customerId, customerCurrencies, issueDate, duzp, dueDate, calc, picked, problems, warnings, versions, quoteNumber, routeFrom, routeTo };
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

const lineRows = (lines: (InvoiceLineCalc & { correctsLineId?: string })[]): InvoiceLineInput[] =>
  lines.map((l, i) => ({
    correctsLineId: l.correctsLineId ?? null,
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
  return earlierDocument(existing, await invoiceRepository.getLines(existing.id, companyId), matches);
}

// The document made under the same idempotency key, when it is the document this request asks for.
function earlierDocument(existing: InvoiceRecord, lines: InvoiceLineRecord[], matches: (r: InvoiceRecord) => boolean): InvoiceDocItem {
  if (!matches(existing)) throw APIError.alreadyExists("This request was already used for another document — reload and try again");
  return toDocItem(existing, lines);
}

/**
 * Runs an issue once per idempotency key: a request whose key has made a document already gets that
 * document back. Two requests with one key at once (a double click): the second finds the first's
 * document under the series lock (invoiceRepository.issue answers it as `replayed`); refused before
 * that - the rows it would bill are billed already, or the unique key - it is answered the same.
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
    if (key) {
      const winner = await replayed(companyId, key, matches);
      if (winner) return winner;
    }
    throw err;
  }
}

type Reader = Parameters<typeof invoiceRepository.getLines>[2];

/** What is left of an invoice to credit, line by line, and the credit notes issued against it so far. */
async function creditState(original: InvoiceRecord, companyId: string, reader?: Reader): Promise<{ credits: InvoiceRecord[]; remaining: RemainingLine[] }> {
  const credits = await invoiceRepository.creditNotesOf(original.id, companyId, reader);
  const lines = await invoiceRepository.getLines(original.id, companyId, reader);
  const against = await invoiceRepository.linesOf(credits.map((c) => c.id), companyId, reader);
  return { credits, remaining: remainingLines(lines, against) };
}

/** The header of a credit note of `original`: same job, parties and rates; dated the day it is issued (§42 ZDPH). */
function creditNoteHeader(original: InvoiceRecord, reason: string, issuedBy: string, key: string | null, totals: ReturnType<typeof creditTotals>) {
  const issueDate = pragueToday();
  return {
    companyId: original.companyId,
    shipmentId: original.shipmentId,
    kind: "credit_note" as const,
    status: "issued" as const,
    correctsInvoiceId: original.id,
    creditReason: reason,
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
    issuedBy,
    idempotencyKey: key,
  };
}

const CREDITED_MEANWHILE = (number: string) => `Invoice ${number} was credited a moment ago — open it again and credit what is left`;

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
      id: l.id,
      correctsLineId: l.correctsLineId ?? null,
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
export const QUEUE_VIEWS: Record<QueueView, string> = {
  all: "all",
  to_bill: "billing",
  not_invoiced: "not-invoiced",
  invoiced: "invoiced",
  unbilled_arrivals: "unbilled-arrivals",
  // the invoiced jobs, of which only those with a charge not on an invoice, or a credit owed, are kept
  invoiced_charges_open: "invoiced",
};

/** How many shipments one queue view shows at most (shipments are fetched 200 per page). */
const QUEUE_MAX = 1000;
/** How many invoiced jobs the check "Marked Invoiced, not every charge on an invoice" looks through, the newest first. */
const CHECK_SCAN_MAX = 5000;
/** How many jobs' selling lines and invoices are read in one go by that check. */
const CHECK_CHUNK = 1000;

type ListedShipment = Awaited<ReturnType<typeof shipments.shipmentList>>["data"][number];

/**
 * The shipments of a shipments-list filter, 200 per page (the list endpoint's maximum), newest first,
 * at most `max`: past it it is the oldest that are left out, never the latest. Also how many match.
 */
async function listedShipments(filter: string, search: string | undefined, max: number): Promise<{ listed: ListedShipment[]; total: number }> {
  const listed: ListedShipment[] = [];
  let total = 0;
  do {
    const page = await shipments.shipmentList({ invoicing: filter, search, limit: 200, offset: listed.length, sortDirection: "desc" });
    total = page.pagination.total;
    listed.push(...page.data);
    if (page.data.length === 0) break;
  } while (listed.length < total && listed.length < max);
  return { listed, total };
}

/**
 * The one-time check of P16: of the jobs that read Invoiced (the newest CHECK_SCAN_MAX), those with a
 * charge on no open invoice - the queue's Lines Invoiced below its Selling Lines - or with a credit owed
 * (M3: a price lowered after the invoice, on no credit note yet; it leaves the job Invoiced, so it would
 * show nowhere else once the Money tab no longer reads the job). A job with no charge at all and nothing
 * owed has nothing left to do and is not listed.
 */
async function invoicedWithChargesOpen(companyId: string, search: string | undefined): Promise<{ listed: ListedShipment[]; scanned: number; total: number }> {
  const { listed, total } = await listedShipments(QUEUE_VIEWS.invoiced_charges_open, search, CHECK_SCAN_MAX);
  const open: ListedShipment[] = [];
  for (let i = 0; i < listed.length; i += CHECK_CHUNK) {
    const chunk = listed.slice(i, i + CHECK_CHUNK);
    const ids = chunk.map((s) => s.id);
    const [rows, openInvoices] = await Promise.all([sellingCostRepository.listLiveByShipments(ids, companyId), invoiceRepository.listOpenInvoicesWithSources(ids, companyId)]);
    const counts = countInvoicedLines(rows, openInvoices);
    const owed = countCreditsOwed(rows, openInvoices);
    open.push(...chunk.filter((s) => {
      const c = counts.get(s.id);
      return (!!c && c.invoiced < c.total) || (owed.get(s.id) ?? 0) > 0;
    }));
  }
  return { listed: open, scanned: listed.length, total };
}

class InvoiceDocumentService {
  async preview(shipmentId: string, companyId: string, params: IssueParams): Promise<InvoicePreviewItem> {
    const ctx = await loadContext(shipmentId, companyId, params);
    return {
      customerId: ctx.customerId,
      customer: ctx.customer ? customerParty(ctx.customer) : null,
      billingAddress: !!ctx.customer?.billingAddress,
      customerCurrencies: ctx.customerCurrencies,
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
      // The user confirmed the preview's total: a line ticked, a VAT code or the currency changed since
      // (a save still on its way, another tab) makes another invoice than the one they agreed to.
      if (params.expectedGross !== undefined && Math.abs(ctx.calc.gross - params.expectedGross) >= 0.005) {
        throw APIError.failedPrecondition("The invoice changed since you checked it — look at it again and issue it then");
      }

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
      const { invoice, lines, replayed: again } = await invoiceRepository.issue(
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
      // The request this one repeats issued it while this one waited for the lock.
      if (again) return earlierDocument(invoice, lines, sameRequest);
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
  /**
   * A credit note of the whole invoice: at once, no approval. After partial credit notes it reverses
   * what they left, so the invoice and all its credit notes come to nothing (lib/partialCredit); a
   * partial one still waiting for a manager is taken back, as nothing is left to credit in part.
   */
  async credit(invoiceId: string, companyId: string, userId: string, reason: string, idempotencyKey?: string): Promise<InvoiceDocItem> {
    const key = idempotencyKey?.trim() || null;
    const sameRequest = (r: InvoiceRecord) => r.kind === "credit_note" && r.correctsInvoiceId === invoiceId;
    return issueOnce(companyId, key, sameRequest, async () => {
      if (!reason.trim()) throw APIError.invalidArgument("Give the reason for the credit note");

      const original = await invoiceRepository.getByIdForCompany(invoiceId, companyId);
      if (!original) throw APIError.notFound("Invoice not found");
      if (original.kind !== "invoice") throw APIError.failedPrecondition("A credit note cannot be credited");
      if (original.status === "cancelled") throw APIError.failedPrecondition(`Invoice ${original.number} was cancelled: it is no longer owed`);
      if (original.status !== "issued") throw APIError.failedPrecondition(`Invoice ${original.number} has already been credited`);

      const [{ credits, remaining }, userEmail] = await Promise.all([creditState(original, companyId), userEmailOf(userId)]);
      // §42 ZDPH: a correction uses the rate of the original supply. With no partial credit before,
      // the credit note must cancel the invoice exactly, so its totals are the invoice's own, negated;
      // after partial ones, what they left of them.
      const calcLines: CreditLineCalc[] = fullCreditLines(remaining);
      const totals = credits.length ? fullCreditTotalsAfter(original, credits) : creditTotals(original);

      const { invoice, lines, replayed: again } = await invoiceRepository.issue(
        // the credit note belongs to the same job and job year as the invoice it corrects
        invoiceSeriesPrefix("CN", original.shipment.jobYear, original.shipment.jobNumber),
        creditNoteHeader(original, reason.trim(), userId, key, totals),
        lineRows(calcLines).map((l) => ({ ...l, sourceSellingCostId: l.sourceSellingCostId || null })),
        {
          // Credit notes of one job are issued one at a time (the series lock): one issued while this
          // was being worked out changed what is left.
          beforeInsert: async (tx) => {
            if ((await invoiceRepository.creditNotesOf(original.id, companyId, tx)).length !== credits.length) throw APIError.failedPrecondition(CREDITED_MEANWHILE(original.number));
          },
          afterInsert: async (tx, inserted) => {
            const ok = await invoiceRepository.markCredited(tx, original.id, companyId);
            if (!ok) throw APIError.failedPrecondition(`Invoice ${original.number} has already been credited`);
            // A Trucking set that now comes to nothing on no invoice (a consignment cancelled after the
            // invoice) could never be billed again: it goes. The status follow-up below counts without it.
            await truckingLinesLock(tx, original.shipmentId);
            await truckingLinesRepository.retireNettedSets(tx, companyId, original.shipmentId);
            await creditNoteRequestRepository.withdrawForInvoice(tx, companyId, original.id, { id: userId, name: userEmail }, `The invoice was credited in full on ${inserted.number}`);
            await invoiceChangeRequestRepository.withdrawForInvoice(tx, companyId, original.id, { id: userId, name: userEmail }, `The invoice was credited in full on ${inserted.number}`);
            await invoiceFollowupOutboxRepository.enqueue(tx, followupsOfCreditNote(inserted, original, actorOf(userId), credits.map((c) => c.number)));
          },
        },
      );
      // The request this one repeats issued it while this one waited for the lock.
      if (again) return earlierDocument(invoice, lines, sameRequest);
      // Sent straight away; what a service does not take now is sent again by the followups cron.
      await deliverInvoiceFollowups(invoice.id);
      const stored = await storePdfQuietly(invoice, lines, companyId);
      return { ...toDocItem(invoice, lines), hasPdf: stored };
    });
  }

  /**
   * Cancels an invoice on the day it was issued, a manager approving a change of it
   * (services/invoiceChangeRequest): no credit note, the invoice kept on record as it was, and its
   * lines billed again - corrected, under the next number. Under the series lock of the job's credit
   * notes, so none is issued meanwhile; refused once one was (a credit note corrects it then), or
   * once the issue day is over. In the same transaction the request is approved, a partial credit
   * note asked for the invoice is taken back, and the customer's list and the shipment's statuses
   * are told (the follow-ups).
   */
  async cancelOnIssueDay(
    request: InvoiceChangeRequestRecord,
    approver: { userId: string; userEmail: string; comment: string },
  ): Promise<InvoiceRecord> {
    const companyId = request.companyId;
    const today = pragueToday();
    const invoice = await db.transaction(async (tx) => {
      const original = await invoiceRepository.getInTx(tx, request.invoiceId, companyId);
      if (!original || original.kind !== "invoice") throw APIError.failedPrecondition("The invoice of this request is not there any more: reject the request");
      await invoiceRepository.lockSeries(tx, companyId, invoiceSeriesPrefix("CN", original.shipment.jobYear, original.shipment.jobNumber));
      const now = await invoiceRepository.getInTx(tx, original.id, companyId);
      if (now?.status === "cancelled") throw APIError.failedPrecondition(`Invoice ${original.number} is cancelled already`);
      if (now?.status !== "issued") throw APIError.failedPrecondition(`Invoice ${original.number} has been credited since: reject the request`);
      if (original.issueDate !== today) throw APIError.failedPrecondition(`Invoice ${original.number} was issued on ${original.issueDate}: it can be cancelled only that day`);
      if ((await invoiceRepository.creditNotesOf(original.id, companyId, tx)).length) {
        throw APIError.failedPrecondition(`Invoice ${original.number} has been credited in part since: correct it with a credit note, and reject the request`);
      }
      if (!(await invoiceRepository.markCancelled(tx, original.id, companyId, today))) throw APIError.failedPrecondition(`Invoice ${original.number} can no longer be cancelled`);
      // As after a full credit note: a Trucking set that comes to nothing on no invoice goes.
      await truckingLinesLock(tx, original.shipmentId);
      await truckingLinesRepository.retireNettedSets(tx, companyId, original.shipmentId);
      if (!(await invoiceChangeRequestRepository.approve(tx, companyId, request.id, approver))) throw APIError.failedPrecondition("This request was answered a moment ago");
      await creditNoteRequestRepository.withdrawForInvoice(tx, companyId, original.id, { id: approver.userId, name: approver.userEmail }, `The invoice was cancelled on its issue day`);
      await invoiceFollowupOutboxRepository.enqueue(tx, followupsOfCancellation(original, actorOf(approver.userId)));
      return { ...original, status: "cancelled" as const };
    });
    await deliverInvoiceFollowups(invoice.id);
    return invoice;
  }

  /** What is left of an invoice to credit, line by line (the credit dialog), and its credit notes so far. */
  async creditState(invoiceId: string, companyId: string): Promise<{ original: InvoiceRecord; credits: InvoiceRecord[]; remaining: RemainingLine[] }> {
    const original = isUuid(invoiceId) ? await invoiceRepository.getByIdForCompany(invoiceId, companyId) : null;
    if (!original) throw APIError.notFound("Invoice not found");
    return { original, ...(await creditState(original, companyId)) };
  }

  /**
   * Issues the partial credit note a manager approved (services/creditNoteRequest): the lines asked,
   * checked again against what is left of the invoice now. In the same transaction the request is
   * marked approved with it, and every credited line either settles a credit the job is owed (a line
   * below nothing on no invoice) or puts a negative selling row on the shipment, so its revenue and
   * profit drop by what was credited, once. Once per request (its idempotency key).
   */
  async issuePartialCredit(request: CreditNoteRequestRecord, approver: { userId: string; userEmail: string; comment: string }): Promise<InvoiceDocItem> {
    const companyId = request.companyId;
    const key = `credit-request:${request.id}`;
    const sameRequest = (r: InvoiceRecord) => r.kind === "credit_note" && r.correctsInvoiceId === request.invoiceId;
    return issueOnce(companyId, key, sameRequest, async () => {
      const original = await invoiceRepository.getByIdForCompany(request.invoiceId, companyId);
      if (!original || original.kind !== "invoice") throw APIError.failedPrecondition("The invoice of this request is not there any more: reject the request");
      if (original.status !== "issued") throw APIError.failedPrecondition(`Invoice ${original.number} has been ${original.status === "cancelled" ? "cancelled" : "credited in full"} since: reject the request`);

      const { credits, remaining } = await creditState(original, companyId);
      const plan = planPartialCredit(remaining, request.lines.map((l) => ({ lineId: l.lineId, amount: l.amount })));
      if ("problem" in plan) throw APIError.failedPrecondition(`${plan.problem}. The invoice has changed since this was asked: reject the request`);
      // Each line bills the row it settles: a credit the job is owed - first one Trucking says is owed on the
      // line's set (its "Price change after invoice" below nothing), then any other line below nothing on no
      // invoice - else the negative row it puts on the shipment (Y1 / P1).
      const creditedRows = plan.lines.flatMap((l) => (l.sourceSellingCostId ? [l.sourceSellingCostId] : []));
      const diffs = await truckingLinesRepository.openCreditDiffs(db, companyId, original.shipmentId, creditedRows);
      const settled = settleTruckingCredit(plan.lines, (rowId) => (rowId ? (diffs.get(rowId) ?? []) : []), randomUUID);
      const calcLines = settled.lines;
      const ownRowIds = new Set(settled.ownRows.map((l) => l.sourceSellingCostId));
      const totals = partialCreditTotals(calcLines, Number(original.fxRate));

      const { invoice, lines, replayed: again } = await invoiceRepository.issue(
        invoiceSeriesPrefix("CN", original.shipment.jobYear, original.shipment.jobNumber),
        creditNoteHeader(original, request.reason, approver.userId, key, totals),
        lineRows(calcLines),
        {
          beforeInsert: async (tx) => {
            await truckingLinesLock(tx, original.shipmentId);
            if ((await invoiceRepository.creditNotesOf(original.id, companyId, tx)).length !== credits.length) {
              throw APIError.failedPrecondition(`Invoice ${original.number} was credited a moment ago: open the request again`);
            }
            // The credits owed, read again under the shipment's lock - also when the first read found none: a
            // Trucking push (or a line below nothing entered) meanwhile changed what is owed, or made a credit
            // owed this note would leave open to come off the next invoice as well.
            const now = await truckingLinesRepository.openCreditDiffs(tx, companyId, original.shipmentId, creditedRows);
            if (!sameCreditsOwed(diffs, now)) {
              throw APIError.failedPrecondition("Trucking changed the price of this job a moment ago, or a line below zero changed: open the request again");
            }
          },
          afterInsert: async (tx, inserted) => {
            const approved = await creditNoteRequestRepository.approve(tx, companyId, request.id, approver, { id: inserted.id, number: inserted.number });
            if (!approved) throw APIError.failedPrecondition("This request was answered a moment ago");
            // A change of the invoice asked meanwhile can't cancel it any more: a credit note corrects it now.
            await invoiceChangeRequestRepository.withdrawForInvoice(tx, companyId, original.id, { id: approver.userId, name: approver.userEmail }, `The invoice was credited in part on ${inserted.number}`);
            await sellingCostRepository.insertCreditRows(
              tx,
              companyId,
              original.shipmentId,
              inserted,
              calcLines
                .filter((line) => ownRowIds.has(line.sourceSellingCostId))
                .map((line) => {
                  const source = remaining.find((r) => r.lineId === line.correctsLineId);
                  return { id: line.sourceSellingCostId, sourceRowId: source?.sourceSellingCostId ?? null, lineText: line.description, amount: line.unitPrice, currency: line.unitCurrency, vatCode: line.vatCode };
                }),
            );
            await truckingLinesRepository.settleDiffs(tx, companyId, original.shipmentId, settled.shrink, settled.rest);
            await invoiceFollowupOutboxRepository.enqueue(tx, followupsOfPartialCreditNote(inserted, original, actorOf(approver.userId)));
          },
        },
      );
      if (again) return earlierDocument(invoice, lines, sameRequest);
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

  /**
   * The job's charges: its selling lines with a value, ticked for Invoice or not, and how many of
   * them are on an issued, not credited invoice. All of them must be before it is Invoiced
   * (lib/shipmentStatus); the same count as the queue's Lines Invoiced.
   */
  async chargeCount(shipmentId: string, companyId: string): Promise<ChargeCount> {
    return isUuid(shipmentId) ? chargeCountOf(shipmentId, companyId) : { invoiced: 0, total: 0 };
  }

  /** Of the shipments, those with an issued, not credited invoice: openInvoiceCount for many at once. */
  async shipmentsWithOpenInvoices(shipmentIds: string[], companyId: string): Promise<string[]> {
    return [...(await invoiceRepository.billedShipmentIds(shipmentIds.filter(isUuid), companyId))];
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
   * or invoiced, cancelled ones left out - and, as in To bill, every job with an open invoice and a
   * charge on no invoice (Q9); the unbilled arrivals are not released, so they are their own tab only.
   * "To bill" = Shipment Status Billing, not invoiced yet, and every job with an open invoice and a
   * charge on no invoice, whatever its status (User Council B4, owner's answer Q9); "Not invoiced" /
   * "Invoiced" = Invoicing Status (the shipments list's invoicingPredicate). The selling lines add the
   * amount still to bill and the invoices issued.
   */
  async queue(
    companyId: string,
    view: QueueView,
    search?: string,
  ): Promise<{ queue: BillingQueueItem[]; counts: BillingQueueCounts; truncated: boolean }> {
    const q = search?.trim() || undefined;
    const countOf = async (filter: string) => (await shipments.shipmentList({ invoicing: filter, search: q, limit: 1 })).pagination.total;

    // The shipments of this view, newest first: past QUEUE_MAX it is the oldest jobs that are left
    // out (the client is told), never the latest. The check reads every invoiced job up to its own
    // maximum and keeps those with a charge not on an invoice.
    const check = view === "invoiced_charges_open" ? await invoicedWithChargesOpen(companyId, q) : null;
    const { listed, total } = check ? { listed: check.listed, total: check.listed.length + (check.total - check.scanned) } : await listedShipments(QUEUE_VIEWS[view], q, QUEUE_MAX);
    // Shown oldest first, as before.
    listed.reverse();

    // Only the listed shipments' rows, invoices and settings are read: the view shows no other.
    const shipmentIds = listed.map((s) => s.id);
    const [rows, openInvoices, settings, today, all, toBill, notInvoiced, invoiced, unbilledArrivals] = await Promise.all([
      sellingCostRepository.listLiveByShipments(shipmentIds, companyId),
      invoiceRepository.listOpenInvoicesWithSources(shipmentIds, companyId),
      billingSettingsRepository.listByShipments(shipmentIds, companyId),
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
    const creditsOwed = countCreditsOwed(rows, openInvoices);
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
        originalsReceivedDate: s.originalsReceivedDate ?? null,
        telexReleaseReceivedDate: s.telexReleaseReceivedDate ?? null,
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
        creditsOwed: creditsOwed.get(s.id) ?? 0,
      };
    });
    const counts: BillingQueueCounts = { all, toBill, notInvoiced, invoiced, unbilledArrivals, ...(check ? { invoicedChargesOpen: check.listed.length } : {}) };
    return { queue, counts, truncated: total > listed.length };
  }

  /** The main search (the top bar): the tax documents these words find, newest issue date first, and how many in all. */
  async searchMain(companyId: string, search: string, limit: number): Promise<SearchInvoicesResponse> {
    const { rows, total } = await invoiceRepository.searchMain(companyId, search, limit);
    return { items: rows.map((r) => ({ ...r, gross: Number(r.gross) })), total };
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
