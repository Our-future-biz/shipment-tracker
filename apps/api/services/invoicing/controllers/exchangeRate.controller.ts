import { api } from "encore.dev/api";
import type { MatchesRegexp, MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { exchangeRateService } from "../services/exchangeRate.service";
import type { ExchangeRateItem } from "../interfaces/interfaces";

// Weekly exchange rates (the Exchange page in the sidebar), entered by hand; CZK per 1 unit.
// Everyone reads them; only managers and up change them.

interface ListRatesResponse {
  rates: ExchangeRateItem[];
}

export const exchangeRateList = api(
  { expose: true, auth: true, method: "GET", path: "/exchange-rates" },
  async (): Promise<ListRatesResponse> => {
    return { rates: await exchangeRateService.list(getAuthData()!.companyID) };
  },
);

interface CreateRateRequest {
  /** ISO week, e.g. "2026-W36" */
  week: string & MatchesRegexp<"^\\d{4}-W\\d{2}$">;
  /** yyyy-mm-dd */
  validFrom: string & MatchesRegexp<"^\\d{4}-\\d{2}-\\d{2}$">;
  /** yyyy-mm-dd */
  validTo: string & MatchesRegexp<"^\\d{4}-\\d{2}-\\d{2}$">;
  rateEur?: string;
  rateUsd?: string;
  note?: string & MaxLen<500>;
}

interface RateResponse {
  rate: ExchangeRateItem;
}

export const exchangeRateCreate = api(
  { expose: true, auth: true, method: "POST", path: "/exchange-rates" },
  async (req: CreateRateRequest): Promise<RateResponse> => {
    const actor = requireRole("superadmin", "admin", "manager");
    return { rate: await exchangeRateService.create(actor.companyID, req) };
  },
);

interface UpdateRateRequest {
  rateId: string;
  rateEur?: string;
  rateUsd?: string;
  note?: string & MaxLen<500>;
}

export const exchangeRateUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/exchange-rates/:rateId" },
  async ({ rateId, ...patch }: UpdateRateRequest): Promise<RateResponse> => {
    const actor = requireRole("superadmin", "admin", "manager");
    return { rate: await exchangeRateService.update(rateId, actor.companyID, patch) };
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
    const actor = requireRole("superadmin", "admin", "manager");
    await exchangeRateService.remove(req.rateId, actor.companyID);
    return { ok: true };
  },
);
