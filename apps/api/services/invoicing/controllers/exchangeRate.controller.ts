import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { exchangeRateRepository } from "../repositories/exchangeRate.repository";
import type { ExchangeRateItem } from "../interfaces/interfaces";

/**
 * Kurzovni listek s tydenni platnosti (stranka Exchange v sidebaru).
 * Kurzy se zadavaji rucne, vzdy v CZK za 1 jednotku meny.
 */

interface ListRatesResponse {
  rates: ExchangeRateItem[];
}

export const exchangeRateList = api(
  { expose: true, auth: true, method: "GET", path: "/exchange-rates" },
  async (): Promise<ListRatesResponse> => {
    const rows = await exchangeRateRepository.listByCompany(getAuthData()!.companyID);
    return { rates: rows as unknown as ExchangeRateItem[] };
  },
);

interface CreateRateRequest {
  week: string;
  validFrom: string;
  validTo: string;
  rateEur?: string;
  rateUsd?: string;
  note?: string;
}

interface CreateRateResponse {
  rate: ExchangeRateItem;
}

export const exchangeRateCreate = api(
  { expose: true, auth: true, method: "POST", path: "/exchange-rates" },
  async (req: CreateRateRequest): Promise<CreateRateResponse> => {
    const companyId = getAuthData()!.companyID;
    const existing = await exchangeRateRepository.getByWeek(companyId, req.week);
    if (existing) throw APIError.alreadyExists(`Rates for ${req.week} already exist`);

    const row = await exchangeRateRepository.create({
      companyId,
      week: req.week,
      validFrom: req.validFrom,
      validTo: req.validTo,
      rateEur: req.rateEur || null,
      rateUsd: req.rateUsd || null,
      note: req.note ?? "",
    });
    return { rate: row as unknown as ExchangeRateItem };
  },
);

interface UpdateRateRequest {
  rateId: string;
  rateEur?: string;
  rateUsd?: string;
  note?: string;
}

interface UpdateRateResponse {
  rate: ExchangeRateItem;
}

export const exchangeRateUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/exchange-rates/:rateId" },
  async (req: UpdateRateRequest): Promise<UpdateRateResponse> => {
    const { rateId, ...data } = req;
    const patch: Record<string, unknown> = {};
    if (data.rateEur !== undefined) patch.rateEur = data.rateEur || null;
    if (data.rateUsd !== undefined) patch.rateUsd = data.rateUsd || null;
    if (data.note !== undefined) patch.note = data.note;

    const row = await exchangeRateRepository.update(rateId, getAuthData()!.companyID, patch);
    if (!row) throw APIError.notFound("Exchange rate not found");
    return { rate: row as unknown as ExchangeRateItem };
  },
);

interface DeleteRateRequest {
  rateId: string;
}

interface DeleteRateResponse {
  ok: boolean;
}

export const exchangeRateDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/exchange-rates/:rateId" },
  async (req: DeleteRateRequest): Promise<DeleteRateResponse> => {
    await exchangeRateRepository.delete(req.rateId, getAuthData()!.companyID);
    return { ok: true };
  },
);
