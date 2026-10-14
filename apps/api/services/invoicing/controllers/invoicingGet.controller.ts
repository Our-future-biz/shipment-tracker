import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { invoicingService } from "../services/invoicing.service";
import type { InvoicingData } from "../interfaces/interfaces";

interface InvoicingGetRequest {
  shipmentId: string;
}

export const invoicingGet = api(
  { expose: true, auth: true, method: "GET", path: "/invoicing/:shipmentId" },
  async (req: InvoicingGetRequest): Promise<InvoicingData> => {
    return invoicingService.getInvoicingData(req.shipmentId, getAuthData()!.companyID);
  },
);
