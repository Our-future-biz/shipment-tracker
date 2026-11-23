import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { coLoadingMoneyService } from "../services/coLoadingMoney.service";
import type { CoLoadingMoneyItem, CoLoadingMoneyJob } from "../interfaces/interfaces";

interface CoLoadingMoneyRequest {
  /** The sailing's shipments with their dates, which choose the ČNB rates each is valued at. */
  jobs: CoLoadingMoneyJob[] & MaxLen<500>;
}

/**
 * Internal API of the shipments service (Co-Loading Concept → a sailing's Earnings): each shipment's
 * selling, inland delivery and other costs from its Costs Breakdown, and its own freight and
 * master-job lines apart - one call for the whole sailing. Read only: it fixes no rate. Company
 * from the caller's auth.
 */
export const _internalCoLoadingMoney = api(
  { expose: false, auth: true, method: "POST", path: "/internal/invoicing/co-loading-money" },
  async ({ jobs }: CoLoadingMoneyRequest): Promise<{ items: CoLoadingMoneyItem[] }> => ({
    items: await coLoadingMoneyService.forJobs(getAuthData()!.companyID, jobs),
  }),
);
