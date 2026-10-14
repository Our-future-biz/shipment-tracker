import { APIError } from "encore.dev/api";
import { quoteRepository } from "../repositories/quote.repository";
import { quoteRefSequenceRepository } from "../repositories/quoteRefSequence.repository";
import type { PaginationRequest } from "../../../lib/db/interface";
import { fx } from "~encore/clients";
import { fxActionFor, type StoredFx } from "../lib/quoteFx";

// Stores today's ČNB rates and ROE % on a quote that has just been sent, and drops them from
// one reopened for revision (see lib/quoteFx). Rates are never changed on a sent quote.
async function withQuoteFx(data: unknown, previous?: unknown): Promise<unknown> {
  const action = fxActionFor(data);
  if (action === "keep") return data;
  const d = { ...(data as Record<string, unknown>) };
  if (action === "clear") {
    delete d.fx;
    return d;
  }
  // A save made from a copy that predates the stored rates must not replace them.
  const prevFx = previous && typeof previous === "object" ? (previous as { fx?: unknown }).fx : undefined;
  if (prevFx) {
    d.fx = prevFx;
    return d;
  }
  const r = await fx.fxRatesOn({});
  const stored: StoredFx = {
    date: r.date,
    fixingDate: r.fixingDate,
    roePct: r.roePct,
    rates: Object.fromEntries(r.rates.map((x) => [x.currency, x.rate])),
    lockedAt: new Date().toISOString(),
  };
  d.fx = stored;
  return d;
}

class QuoteService {
  async list(companyId: string, request: PaginationRequest & { customerId?: string }) {
    const limit = Math.min(request.limit ?? 100, 1000);
    const fetchLimit = limit + (request.offset ?? 0);
    const rows = request.customerId
      ? await quoteRepository.listForCustomer(companyId, request.customerId, fetchLimit)
      : await quoteRepository.listForCompany(companyId, fetchLimit);
    // listForCompany returns newest-first; apply offset/limit window here.
    const offset = request.offset ?? 0;
    const data = rows.slice(offset, offset + limit);
    return { pagination: { total: rows.length, offset, limit }, data };
  }

  async getByQuoteNumber(quoteNumber: string, companyId: string) {
    return quoteRepository.findByQuoteNumber(quoteNumber, companyId);
  }

  async create(companyId: string, quoteNumber: string, data: unknown, terms?: string) {
    // A quote reference is permanent and can never be reused (within the company).
    const existing = await quoteRepository.getByColumnForCompany(
      quoteRepository["table"].quoteNumber,
      quoteNumber,
      companyId,
      { includeDeleted: true },
    );
    if (existing) {
      throw APIError.alreadyExists(`Quote reference ${quoteNumber} already exists and cannot be reused`);
    }
    return quoteRepository.createForCompany(companyId, { quoteNumber, data: await withQuoteFx(data), terms: terms ?? "" } as never);
  }

  async updateData(quoteNumber: string, companyId: string, data: unknown) {
    const existing = await quoteRepository.findByQuoteNumber(quoteNumber, companyId);
    return quoteRepository.updateData(quoteNumber, companyId, await withQuoteFx(data, existing?.data));
  }

  async updateTerms(id: string, companyId: string, terms: string) {
    return quoteRepository.updateForCompany(id, companyId, { terms } as never);
  }

  async softDelete(id: string, companyId: string) {
    return quoteRepository.softDeleteForCompany(id, companyId);
  }

  async allocateSubLineRef(quoteNumber: string, companyId: string): Promise<string> {
    const subLine = await quoteRefSequenceRepository.getNextSubLine(quoteNumber, companyId);
    return `${quoteNumber}-${String(subLine).padStart(3, "0")}`;
  }

  // Sales-module quote reference: QCZ{YYYYMMDD}{NNN}, a per-company sequence per day.
  async nextSalesReference(companyId: string): Promise<string> {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
      now.getDate(),
    ).padStart(2, "0")}`;
    const prefix = `QCZ${datePart}`;
    const numbers = await quoteRepository.findNumbersByPrefix(prefix, companyId);
    let max = 0;
    for (const n of numbers) {
      const rest = n.slice(prefix.length);
      // Ignore duplicate suffixes (contain "-"); only base sequences count.
      if (rest.includes("-")) continue;
      const seq = parseInt(rest, 10);
      if (!Number.isNaN(seq) && seq > max) max = seq;
    }
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
  }

  // Duplicate a sales quote: never reuse the reference, append -2, -3, ...
  async duplicateSalesQuote(companyId: string, baseRef: string, data: unknown): Promise<{ quoteNumber: string; quote: unknown }> {
    // Strip any existing duplicate suffix so branches always come off the base.
    const base = baseRef.replace(/-\d+$/, "");
    const existing = await quoteRepository.findNumbersByPrefix(`${base}-`, companyId);
    let max = 1;
    for (const n of existing) {
      const suffix = n.slice(base.length + 1);
      const seq = parseInt(suffix, 10);
      if (!Number.isNaN(seq) && seq > max) max = seq;
    }
    const newRef = `${base}-${max + 1}`;
    const quote = await quoteRepository.createForCompany(companyId, { quoteNumber: newRef, data: await withQuoteFx(data), terms: "" } as never);
    return { quoteNumber: newRef, quote };
  }
}

export const quoteService = new QuoteService();
