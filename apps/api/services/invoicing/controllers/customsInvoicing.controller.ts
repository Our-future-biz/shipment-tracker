import { api } from "encore.dev/api";
import type { MaxLen, Min } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { customsInvoicingService } from "../services/customsInvoicing.service";
import type { CustomsInvoiceLineItem, CustomsInvoicingItem } from "../interfaces/interfaces";

// Invoicing tab of a shipment opened in Customs.

interface CustomsInvoicingGetRequest {
  shipmentId: string;
}

export const customsInvoicingGet = api(
  { expose: true, auth: true, method: "GET", path: "/customs-invoicing/:shipmentId" },
  async (req: CustomsInvoicingGetRequest): Promise<CustomsInvoicingItem> => {
    return customsInvoicingService.get(req.shipmentId, getAuthData()!.companyID);
  },
);

interface AddCustomsLineRequest {
  shipmentId: string;
  category?: string & MaxLen<200>;
  currency?: string & MaxLen<3>;
  value?: string & MaxLen<20>;
  sortOrder?: number & Min<0>;
}

interface CustomsLineResponse {
  line: CustomsInvoiceLineItem;
}

export const customsInvoicingAddLine = api(
  { expose: true, auth: true, method: "POST", path: "/customs-invoicing/:shipmentId/lines" },
  async ({ shipmentId, ...input }: AddCustomsLineRequest): Promise<CustomsLineResponse> => {
    return { line: await customsInvoicingService.addLine(shipmentId, getAuthData()!.companyID, input) };
  },
);

interface UpdateCustomsLineRequest {
  shipmentId: string;
  lineId: string;
  category?: string & MaxLen<200>;
  currency?: string & MaxLen<3>;
  value?: string & MaxLen<20>;
}

export const customsInvoicingUpdateLine = api(
  { expose: true, auth: true, method: "PATCH", path: "/customs-invoicing/:shipmentId/lines/:lineId" },
  async ({ shipmentId, lineId, ...input }: UpdateCustomsLineRequest): Promise<CustomsLineResponse> => {
    return { line: await customsInvoicingService.updateLine(shipmentId, lineId, getAuthData()!.companyID, input) };
  },
);

interface DeleteCustomsLineRequest {
  shipmentId: string;
  lineId: string;
}

interface DeleteCustomsLineResponse {
  ok: boolean;
}

export const customsInvoicingDeleteLine = api(
  { expose: true, auth: true, method: "DELETE", path: "/customs-invoicing/:shipmentId/lines/:lineId" },
  async (req: DeleteCustomsLineRequest): Promise<DeleteCustomsLineResponse> => {
    await customsInvoicingService.deleteLine(req.shipmentId, req.lineId, getAuthData()!.companyID);
    return { ok: true };
  },
);

interface SetIssuedInvoiceNumberRequest {
  shipmentId: string;
  issuedInvoiceNumber: string & MaxLen<100>;
}

interface SetIssuedInvoiceNumberResponse {
  issuedInvoiceNumber: string;
}

export const customsInvoicingSetNumber = api(
  { expose: true, auth: true, method: "PUT", path: "/customs-invoicing/:shipmentId/number" },
  async (req: SetIssuedInvoiceNumberRequest): Promise<SetIssuedInvoiceNumberResponse> => {
    const companyId = getAuthData()!.companyID;
    return { issuedInvoiceNumber: await customsInvoicingService.setIssuedInvoiceNumber(req.shipmentId, companyId, req.issuedInvoiceNumber) };
  },
);
