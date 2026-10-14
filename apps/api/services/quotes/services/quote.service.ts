import { APIError } from "encore.dev/api";
import { quoteRepository } from "../repositories/quote.repository";
import { quoteRefSequenceRepository } from "../repositories/quoteRefSequence.repository";
import type { NewQuoteRecord } from "../schemas/quote.schema";
import type { PaginationRequest } from "../../../lib/db/interface";
import type { QuoteItem, QuotePage } from "../interfaces/interfaces";
import { toQuoteItem } from "../lib/mappers";
import { baseRef, nextDuplicateRef, nextSalesRef, salesRefPrefix, subLineRef } from "../lib/refs";
import { quoteAttachmentService } from "./quoteAttachment.service";
import { fx } from "~encore/clients";
import { planQuoteFx, type StoredFx } from "../lib/quoteFx";

// Applies the quote's rate rule (lib/quoteFx): drafts carry no rates; a sent quote keeps the
// rates stored on it, or gets today's stamped now. A client-sent `fx` is never stored.
async function withQuoteFx(data: unknown, previous?: unknown): Promise<unknown> {
  const plan = planQuoteFx(data, previous);
  if (plan.action === "leave") return data;
  const d: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  if (plan.action === "clear") {
    delete d.fx;
    return d;
  }
  if (plan.action === "reuse") {
    d.fx = plan.fx;
    return d;
  }
  const r = await fx.fxRatesOn({});
  const stamped: StoredFx = {
    date: r.date,
    fixingDate: r.fixingDate,
    roePct: r.roePct,
    rates: Object.fromEntries(r.rates.map((x) => [x.currency, x.rate])),
    lockedAt: new Date().toISOString(),
  };
  d.fx = stamped;
  return d;
}

class QuoteService {
  async list(companyId: string, request: PaginationRequest & { customerId?: string }): Promise<QuotePage> {
    const limit = Math.min(request.limit ?? 100, 1000);
    const offset = request.offset ?? 0;
    const fetchLimit = limit + offset;
    const rows = request.customerId
      ? await quoteRepository.listForCustomer(companyId, request.customerId, fetchLimit)
      : await quoteRepository.listForCompany(companyId, fetchLimit);
    // Both lists are newest-first; the offset/limit window is applied here.
    return { pagination: { total: rows.length, offset, limit }, data: rows.slice(offset, offset + limit).map(toQuoteItem) };
  }

  async get(quoteNumber: string, companyId: string): Promise<QuoteItem> {
    const row = await quoteRepository.findByQuoteNumber(quoteNumber, companyId);
    if (!row) throw APIError.notFound("Quote not found");
    return toQuoteItem(row);
  }

  async create(companyId: string, quoteNumber: string, data: unknown, terms?: string): Promise<QuoteItem> {
    // A quote reference is permanent and can never be reused (within the company).
    if (await quoteRepository.findByQuoteNumber(quoteNumber, companyId, { includeDeleted: true })) {
      throw APIError.alreadyExists(`Quote reference ${quoteNumber} already exists and cannot be reused`);
    }
    return this.insert(companyId, quoteNumber, data, terms ?? "");
  }

  async update(quoteNumber: string, companyId: string, changes: { data?: unknown; terms?: string }): Promise<QuoteItem> {
    let row = await quoteRepository.findByQuoteNumber(quoteNumber, companyId);
    if (!row) throw APIError.notFound("Quote not found");
    if (changes.data !== undefined) {
      row = (await quoteRepository.updateData(quoteNumber, companyId, await withQuoteFx(changes.data, row.data))) ?? row;
    }
    if (changes.terms !== undefined) row = (await quoteRepository.updateForCompany(row.id, companyId, { terms: changes.terms })) ?? row;
    return toQuoteItem(row);
  }

  // The quote and its attachments go together.
  async softDelete(quoteNumber: string, companyId: string): Promise<void> {
    const row = await quoteRepository.findByQuoteNumber(quoteNumber, companyId);
    if (!row) throw APIError.notFound("Quote not found");
    await quoteRepository.softDeleteForCompany(row.id, companyId);
    await quoteAttachmentService.removeAllOfQuote(quoteNumber, companyId);
  }

  async allocateSubLineRef(quoteNumber: string, companyId: string): Promise<string> {
    return subLineRef(quoteNumber, await quoteRefSequenceRepository.takeNextSubLine(quoteNumber, companyId));
  }

  // Sales-module quote reference: QCZ{YYYYMMDD}{NNN}, a per-company sequence per day. Soft-deleted
  // quotes count too: a reference is never reused.
  async nextSalesReference(companyId: string): Promise<string> {
    const prefix = salesRefPrefix(new Date());
    return nextSalesRef(prefix, await quoteRepository.findNumbersByPrefix(prefix, companyId));
  }

  // Duplicate a sales quote: never reuse the reference, append -2, -3, … to the base reference.
  async duplicateSalesQuote(companyId: string, ref: string, data: unknown): Promise<{ quoteNumber: string; quote: QuoteItem }> {
    const base = baseRef(ref);
    const quoteNumber = nextDuplicateRef(base, await quoteRepository.findNumbersByPrefix(`${base}-`, companyId));
    return { quoteNumber, quote: await this.insert(companyId, quoteNumber, data, "") };
  }

  private async insert(companyId: string, quoteNumber: string, data: unknown, terms: string): Promise<QuoteItem> {
    const values: Omit<NewQuoteRecord, "companyId"> = { quoteNumber, data: await withQuoteFx(data), terms };
    return toQuoteItem(await quoteRepository.createForCompany(companyId, values));
  }
}

export const quoteService = new QuoteService();
