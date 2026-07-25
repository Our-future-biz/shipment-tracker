import { quoteRepository } from "../repositories/quote.repository";
import { quoteRefSequenceRepository } from "../repositories/quoteRefSequence.repository";
import type { PaginationRequest } from "../../../lib/db/interface";

class QuoteService {
  async list(request: PaginationRequest) {
    return quoteRepository.getPaginated({
      request,
      defaultOrderBy: quoteRepository["table"].createdAt,
      defaultMaxLimit: 200,
      defaultLimit: 100,
    });
  }

  async getByQuoteNumber(quoteNumber: string) {
    return quoteRepository.findByQuoteNumber(quoteNumber);
  }

  async create(quoteNumber: string, data: unknown, terms?: string) {
    return quoteRepository.create({ quoteNumber, data, terms: terms ?? "" } as never);
  }

  async updateData(quoteNumber: string, data: unknown) {
    return quoteRepository.updateData(quoteNumber, data);
  }

  async updateTerms(id: string, terms: string) {
    return quoteRepository.update(id, { terms } as never);
  }

  async softDelete(id: string) {
    return quoteRepository.softDelete(id);
  }

  async allocateSubLineRef(quoteNumber: string): Promise<string> {
    const subLine = await quoteRefSequenceRepository.getNextSubLine(quoteNumber);
    return `${quoteNumber}-${String(subLine).padStart(3, "0")}`;
  }

  // Sales-module quote reference: QCZ{YYYYMMDD}{NNN}, sequence per day.
  async nextSalesReference(): Promise<string> {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
      now.getDate(),
    ).padStart(2, "0")}`;
    const prefix = `QCZ${datePart}`;
    const numbers = await quoteRepository.findNumbersByPrefix(prefix);
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
  async duplicateSalesQuote(baseRef: string, data: unknown): Promise<{ quoteNumber: string; quote: unknown }> {
    // Strip any existing duplicate suffix so branches always come off the base.
    const base = baseRef.replace(/-\d+$/, "");
    const existing = await quoteRepository.findNumbersByPrefix(`${base}-`);
    let max = 1;
    for (const n of existing) {
      const suffix = n.slice(base.length + 1);
      const seq = parseInt(suffix, 10);
      if (!Number.isNaN(seq) && seq > max) max = seq;
    }
    const newRef = `${base}-${max + 1}`;
    const quote = await quoteRepository.create({ quoteNumber: newRef, data, terms: "" } as never);
    return { quoteNumber: newRef, quote };
  }
}

export const quoteService = new QuoteService();
