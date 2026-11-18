import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { operationsMoneyService } from "../services/operationsMoney.service";
import type { OperationsMoney, OperationsMoneyJobDates } from "../interfaces/interfaces";

interface OperationsMoneyRequest {
  shipmentIds: string[] & MaxLen<2000>;
  /**
   * The jobs' dates as Shipments holds them. A job whose ČNB rates are not fixed yet is valued by them, as its
   * Costs Breakdown shows it (by ETA / ETD, by ATA / ATD once there) - without fixing anything. Left out, such a
   * job's totals in another currency than CZK are not known (null, with the currencies named).
   */
  jobDates?: OperationsMoneyJobDates[] & MaxLen<2000>;
}

/**
 * Internal API of the shipments service (Shipments → Managers, the Money tab): the money facts of many jobs in
 * one read - work not yet invoiced, Costs Breakdown's totals, the first invoice's day, delay charges not sold on,
 * supplier invoices and estimates with none. Read only: it gathers no supplier invoice and fixes no rate.
 * Company from the caller's auth.
 */
export const _internalOperationsMoney = api(
  { expose: false, auth: true, method: "POST", path: "/internal/invoicing/operations-money" },
  async ({ shipmentIds, jobDates }: OperationsMoneyRequest): Promise<OperationsMoney> =>
    operationsMoneyService.forJobs(getAuthData()!.companyID, shipmentIds, jobDates ?? []),
);
