import { createHash, randomUUID } from "node:crypto";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { customers, shipments } from "~encore/clients";
import { invoiceRepository, type InvoiceLineInput } from "../repositories/invoice.repository";
import { invoiceProfileRepository } from "../repositories/invoiceProfile.repository";
import { sellingCostRepository } from "../repositories/sellingCost.repository";
import { billingSettingsRepository } from "../repositories/billingSettings.repository";
import { exchangeRateRepository } from "../repositories/exchangeRate.repository";
import type { CustomerSnapshot, InvoiceLineRecord, InvoiceRecord, ShipmentSnapshot, SupplierSnapshot } from "../schemas/invoice.schema";
import { missingForIssue, normaliseProfile } from "../lib/invoiceProfile";
import { invoiceSeriesPrefix, jobYear } from "../lib/invoiceNumber";
import {
  addDays,
  calculateInvoice,
  creditLines,
  defaultDuzp,
  dueDays,
  isIsoDate,
  pickRates,
  summarise,
  type InvoiceCalc,
  type InvoiceLineCalc,
  type VatCode,
} from "../lib/invoiceCalc";
import type { InvoiceDocItem, InvoiceDocLineItem, InvoicePartyItem, InvoicePreviewItem } from "../interfaces/interfaces";
import { renderInvoicePdf, type InvoiceForPdf } from "../lib/invoicePdf";
import { loadPdfFonts } from "../lib/pdfFonts";
import { invoiceBucket } from "../storage/invoiceBucket";

/**
 * Issuing tax documents. Everything is computed on the server from stored data: the
 * selling rows ticked for Invoice, the Exchange rates of the DUZP week, the customer and
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

const supplierParty = (s: SupplierSnapshot): InvoicePartyItem => ({
  companyName: s.companyName, address: s.street, city: s.city, postalCode: s.postalCode, country: s.country, ico: s.ico, dic: s.dic,
});

const customerParty = (c: CustomerSnapshot): InvoicePartyItem => ({
  companyName: c.companyName, address: c.address, city: c.city, postalCode: "", country: c.country, ico: c.ico, dic: c.dic,
});

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
  const [rows, settings, rateRows] = await Promise.all([
    sellingCostRepository.listByShipmentId(shipmentId, companyId),
    billingSettingsRepository.getByShipmentId(shipmentId, companyId),
    exchangeRateRepository.listByCompany(companyId),
  ]);

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
    } catch {
      problems.push("The chosen customer was not found");
    }
  }

  if (!profile) problems.push("Fill in the invoicing details under Settings → Organization");
  else {
    const missing = missingForIssue(profile);
    if (missing.length) problems.push(`Invoicing details are missing: ${missing.join(", ")} (Settings → Organization)`);
  }

  const currency = settings?.billingCurrency || "CZK";
  const picked = pickRates(rateRows, isIsoDate(duzp) ? duzp : issueDate);
  const calc = calculateInvoice({
    rows: rows.map((r) => ({
      id: r.id, category: r.category, qty: r.qty, amount: r.amount, currency: r.currency, invoice: r.invoice, vatCode: r.vatCode,
    })),
    currency,
    rates: picked.rates,
    tradeDirection: shipment.tradeDirection,
    vatPayer: profile?.vatPayer ?? true,
  });
  if (calc.missingCurrencies.length) problems.push(`No exchange rate for ${calc.missingCurrencies.join(", ")} — add it on the Exchange page`);
  if (calc.lines.length === 0) problems.push("Tick at least one selling row for Invoice");
  else if (calc.gross <= 0) problems.push("The invoice total must be above zero");

  const dueDate = addDays(issueDate, dueDays(customer?.paymentTerms, profile?.defaultDueDays ?? 14));
  return { shipment, profile, customer, customerId, issueDate, duzp, dueDate, calc, picked, problems };
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
  }));

const money = (calc: Pick<InvoiceCalc, "net" | "vat" | "gross" | "netCzk" | "vatCzk" | "grossCzk">) => ({
  net: calc.net.toFixed(2),
  vat: calc.vat.toFixed(2),
  gross: calc.gross.toFixed(2),
  netCzk: calc.netCzk.toFixed(2),
  vatCzk: calc.vatCzk.toFixed(2),
  grossCzk: calc.grossCzk.toFixed(2),
});

/** Adds the document to the customer's invoice list (aging / credit). Never blocks issuing. */
async function postToCustomer(inv: InvoiceRecord) {
  try {
    await customers.invoiceCreate({
      customerId: inv.customerId,
      invoiceNumber: inv.number,
      amount: Number(inv.gross),
      currency: inv.currency,
      dueDate: inv.dueDate,
      status: "Open",
      issuedAt: inv.issueDate,
    });
  } catch (err) {
    log.error(err, "could not add the invoice to the customer's invoice list", { number: inv.number });
  }
}

export interface InvoicePdfFile {
  fileName: string;
  contentBase64: string;
  sha256: string;
}

async function pdfInput(inv: InvoiceRecord, lines: InvoiceLineRecord[], companyId: string): Promise<InvoiceForPdf> {
  const corrected = inv.correctsInvoiceId ? await invoiceRepository.getById(inv.correctsInvoiceId, companyId) : null;
  return {
    kind: inv.kind,
    number: inv.number,
    issueDate: inv.issueDate,
    duzp: inv.duzp,
    dueDate: inv.dueDate,
    currency: inv.currency,
    fxRate: inv.fxRate,
    fxWeek: inv.fxWeek,
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

  await invoiceBucket.remove(key).catch(() => undefined);
  const winner = await invoiceRepository.getById(inv.id, companyId);
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

class InvoiceDocumentService {
  async preview(shipmentId: string, companyId: string, params: IssueParams): Promise<InvoicePreviewItem> {
    const ctx = await loadContext(shipmentId, companyId, params);
    return {
      customerId: ctx.customerId,
      customer: ctx.customer ? customerParty(ctx.customer) : null,
      issueDate: ctx.issueDate,
      duzp: ctx.duzp,
      dueDate: ctx.dueDate,
      currency: ctx.calc.currency,
      fxRate: ctx.calc.fxRate,
      fxWeek: ctx.picked.week,
      fxSource: ctx.picked.source,
      net: ctx.calc.net,
      vat: ctx.calc.vat,
      gross: ctx.calc.gross,
      netCzk: ctx.calc.netCzk,
      vatCzk: ctx.calc.vatCzk,
      grossCzk: ctx.calc.grossCzk,
      vatSummary: ctx.calc.vatSummary,
      lines: ctx.calc.lines.map(lineItem),
      problems: ctx.problems,
    };
  }

  async issue(shipmentId: string, companyId: string, userId: string, params: IssueParams): Promise<InvoiceDocItem> {
    const key = params.idempotencyKey?.trim() || null;
    if (key) {
      const existing = await invoiceRepository.getByIdempotencyKey(companyId, key);
      if (existing) return toDocItem(existing, await invoiceRepository.getLines(existing.id, companyId));
    }

    const ctx = await loadContext(shipmentId, companyId, params);
    if (ctx.problems.length) throw APIError.failedPrecondition(ctx.problems.join("; "));

    const shipmentSnapshot: ShipmentSnapshot = {
      jobNumber: ctx.shipment.jobNumber,
      jobYear: jobYear(ctx.shipment.createdAt),
      tradeDirection: ctx.shipment.tradeDirection,
      shipper: ctx.shipment.shipper,
      consignee: ctx.shipment.consignee,
      bookingNumber: ctx.shipment.bookingNumber,
      containerNumber: ctx.shipment.containerNumber,
      personalReference: ctx.shipment.personalReference,
    };
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
        fxWeek: ctx.picked.week,
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
    );
    await postToCustomer(invoice);
    const stored = await storePdfQuietly(invoice, lines, companyId);
    return { ...toDocItem(invoice, lines), hasPdf: stored };
  }

  /**
   * Credit note (opravný daňový doklad, §45): reverses the whole original invoice with the
   * same rates and VAT codes, numbered CN + job year + job number + sequence.
   */
  async credit(invoiceId: string, companyId: string, userId: string, reason: string, idempotencyKey?: string): Promise<InvoiceDocItem> {
    const key = idempotencyKey?.trim() || null;
    if (key) {
      const existing = await invoiceRepository.getByIdempotencyKey(companyId, key);
      if (existing) return toDocItem(existing, await invoiceRepository.getLines(existing.id, companyId));
    }
    if (!reason.trim()) throw APIError.invalidArgument("Give the reason for the credit note");

    const original = await invoiceRepository.getById(invoiceId, companyId);
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
        vatCode: l.vatCode as VatCode,
        vatRate: Number(l.vatRate),
      })),
    );
    const totals = summarise(calcLines, Number(original.fxRate));
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
      async (tx) => {
        const ok = await invoiceRepository.markCredited(tx, original.id, companyId);
        if (!ok) throw APIError.failedPrecondition(`Invoice ${original.number} has already been credited`);
      },
    );
    await postToCustomer(invoice);
    const stored = await storePdfQuietly(invoice, lines, companyId);
    return { ...toDocItem(invoice, lines), hasPdf: stored };
  }

  /** The official PDF: the stored copy, or made and stored now if issuing could not store it. */
  async pdf(id: string, companyId: string): Promise<InvoicePdfFile> {
    const row = await invoiceRepository.getById(id, companyId);
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

  async list(shipmentId: string, companyId: string): Promise<InvoiceDocItem[]> {
    const rows = await invoiceRepository.listByShipment(shipmentId, companyId);
    return Promise.all(rows.map(async (r) => toDocItem(r, await invoiceRepository.getLines(r.id, companyId))));
  }

  async get(id: string, companyId: string): Promise<InvoiceDocItem> {
    const row = await invoiceRepository.getById(id, companyId);
    if (!row) throw APIError.notFound("Invoice not found");
    return toDocItem(row, await invoiceRepository.getLines(row.id, companyId));
  }
}

export const invoiceDocumentService = new InvoiceDocumentService();
