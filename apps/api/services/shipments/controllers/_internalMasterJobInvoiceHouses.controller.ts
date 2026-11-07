import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { masterJobService } from "../services/masterJob.service";
import type { MasterJobInvoiceHouseItem } from "../interfaces/interfaces";

interface MasterJobInvoiceHousesRequest {
  masterJobId: string;
}

interface MasterJobInvoiceHousesResponse {
  houses: MasterJobInvoiceHouseItem[];
}

// The master job's live shipments with their House B/L, whether they are cancelled and their freight
// tons: what the invoicing service checks a vendor invoice read line by line against, so a line only
// reaches a shipment of this master job. Refuses a master job that is not the company's.
export const _internalMasterJobInvoiceHouses = api(
  { expose: false, auth: true, method: "GET", path: "/internal/shipments/master-jobs/:masterJobId/invoice-houses" },
  async ({ masterJobId }: MasterJobInvoiceHousesRequest): Promise<MasterJobInvoiceHousesResponse> => ({
    houses: await masterJobService.invoiceHouses(masterJobId, getAuthData()!.companyID),
  }),
);
