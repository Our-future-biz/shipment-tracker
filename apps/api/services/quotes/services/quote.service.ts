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
}

export const quoteService = new QuoteService();
