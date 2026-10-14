import { APIError } from "encore.dev/api";
import { definedOnly, toDecimal } from "../lib/amounts";
import { exchangeRateRepository } from "../repositories/exchangeRate.repository";
import type { ExchangeRateRecord, NewExchangeRateRecord } from "../schemas/exchangeRate.schema";
import type { ExchangeRateInput, ExchangeRateItem, ExchangeRatePatch } from "../interfaces/interfaces";

// Weekly exchange rates, entered by hand on the Exchange page; always CZK per 1 unit.

const toItem = (r: ExchangeRateRecord): ExchangeRateItem => ({
  id: r.id,
  week: r.week,
  validFrom: r.validFrom,
  validTo: r.validTo,
  rateEur: r.rateEur,
  rateUsd: r.rateUsd,
  note: r.note,
});

// Rates are stored with 4 decimal places; a blank rate is "not entered".
export function rateChanges(patch: ExchangeRatePatch): Partial<NewExchangeRateRecord> {
  return definedOnly({
    rateEur: toDecimal(patch.rateEur, "rateEur", 4),
    rateUsd: toDecimal(patch.rateUsd, "rateUsd", 4),
    note: patch.note,
  });
}

class ExchangeRateService {
  async list(companyId: string): Promise<ExchangeRateItem[]> {
    return (await exchangeRateRepository.listByCompany(companyId)).map(toItem);
  }

  async create(companyId: string, input: ExchangeRateInput): Promise<ExchangeRateItem> {
    if (input.validTo < input.validFrom) throw APIError.invalidArgument("validTo is before validFrom");
    if (await exchangeRateRepository.getByWeek(companyId, input.week)) {
      throw APIError.alreadyExists(`Rates for ${input.week} already exist`);
    }
    const row = await exchangeRateRepository.createForCompany(companyId, {
      week: input.week,
      validFrom: input.validFrom,
      validTo: input.validTo,
      ...rateChanges(input),
    });
    return toItem(row);
  }

  async update(id: string, companyId: string, patch: ExchangeRatePatch): Promise<ExchangeRateItem> {
    const row = await exchangeRateRepository.updateForCompany(id, companyId, rateChanges(patch));
    if (!row) throw APIError.notFound("Exchange rate not found");
    return toItem(row);
  }

  async remove(id: string, companyId: string): Promise<void> {
    if (!(await exchangeRateRepository.softDeleteForCompany(id, companyId))) throw APIError.notFound("Exchange rate not found");
  }
}

export const exchangeRateService = new ExchangeRateService();
