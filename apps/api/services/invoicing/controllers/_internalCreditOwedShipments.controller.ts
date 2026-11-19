import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { operationsMoneyService } from "../services/operationsMoney.service";

interface CreditOwedShipmentsResponse {
  /** The jobs with an open invoice and a selling line below nothing on no invoice or credit note: a credit owed. Newest first, at most 1000. */
  shipmentIds: string[];
}

// Internal API of the shipments service (Shipments → Managers, the Money tab, M3): the jobs that owe their customer a
// credit, however long ago they were invoiced - the tab reads the invoiced jobs only so far back, and a credit owed
// leaves a job Invoiced, so without this it would show nowhere. Read only. Company from the caller's auth.
export const _internalCreditOwedShipments = api(
  { expose: false, auth: true, method: "GET", path: "/internal/invoicing/credit-owed-shipments" },
  async (): Promise<CreditOwedShipmentsResponse> => ({ shipmentIds: await operationsMoneyService.creditOwedJobs(getAuthData()!.companyID) }),
);
