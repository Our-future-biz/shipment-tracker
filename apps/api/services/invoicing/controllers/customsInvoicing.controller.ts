import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customsInvoiceRepository } from "../repositories/customsInvoice.repository";
import type { CustomsInvoiceLineItem } from "../interfaces/interfaces";

// Invoicing tab of a shipment opened in Customs: lines of Category, Currency and Value,
// and one Issued Invoice Number for the whole shipment.

// Postgres rejects "" for a numeric column, so a cleared value is stored as empty (null).
const toValue = (v: string | undefined) => (v === undefined ? undefined : v.trim() === "" ? null : v.trim());

interface CustomsInvoicingGetRequest {
  shipmentId: string;
}

interface CustomsInvoicingGetResponse {
  lines: CustomsInvoiceLineItem[];
  issuedInvoiceNumber: string;
}

export const customsInvoicingGet = api(
  { expose: true, auth: true, method: "GET", path: "/customs-invoicing/:shipmentId" },
  async (req: CustomsInvoicingGetRequest): Promise<CustomsInvoicingGetResponse> => {
    const companyId = getAuthData()!.companyID;
    const [lines, invoice] = await Promise.all([
      customsInvoiceRepository.listLines(req.shipmentId, companyId),
      customsInvoiceRepository.getInvoice(req.shipmentId, companyId),
    ]);
    return {
      lines: lines as unknown as CustomsInvoiceLineItem[],
      issuedInvoiceNumber: invoice?.issuedInvoiceNumber ?? "",
    };
  },
);

interface AddCustomsLineRequest {
  shipmentId: string;
  category?: string;
  currency?: string;
  value?: string;
  sortOrder?: number;
}

interface CustomsLineResponse {
  line: CustomsInvoiceLineItem;
}

export const customsInvoicingAddLine = api(
  { expose: true, auth: true, method: "POST", path: "/customs-invoicing/:shipmentId/lines" },
  async (req: AddCustomsLineRequest): Promise<CustomsLineResponse> => {
    const { shipmentId, value, ...data } = req;
    const line = await customsInvoiceRepository.createLine({
      companyId: getAuthData()!.companyID,
      shipmentId,
      ...data,
      value: toValue(value),
    });
    return { line: line as unknown as CustomsInvoiceLineItem };
  },
);

interface UpdateCustomsLineRequest {
  shipmentId: string;
  lineId: string;
  category?: string;
  currency?: string;
  value?: string;
}

export const customsInvoicingUpdateLine = api(
  { expose: true, auth: true, method: "PATCH", path: "/customs-invoicing/:shipmentId/lines/:lineId" },
  async (req: UpdateCustomsLineRequest): Promise<CustomsLineResponse> => {
    const { shipmentId, lineId, value, ...rest } = req;
    const data: Record<string, unknown> = { ...rest };
    if (value !== undefined) data.value = toValue(value);
    for (const key of Object.keys(data)) if (data[key] === undefined) delete data[key];
    const line = await customsInvoiceRepository.updateLine(lineId, getAuthData()!.companyID, shipmentId, data);
    if (!line) throw APIError.notFound("Line not found");
    return { line: line as unknown as CustomsInvoiceLineItem };
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
    await customsInvoiceRepository.deleteLine(req.lineId, getAuthData()!.companyID, req.shipmentId);
    return { ok: true };
  },
);

interface SetIssuedInvoiceNumberRequest {
  shipmentId: string;
  issuedInvoiceNumber: string;
}

interface SetIssuedInvoiceNumberResponse {
  issuedInvoiceNumber: string;
}

export const customsInvoicingSetNumber = api(
  { expose: true, auth: true, method: "PUT", path: "/customs-invoicing/:shipmentId/number" },
  async (req: SetIssuedInvoiceNumberRequest): Promise<SetIssuedInvoiceNumberResponse> => {
    const row = await customsInvoiceRepository.upsertInvoice(req.shipmentId, getAuthData()!.companyID, req.issuedInvoiceNumber.trim());
    return { issuedInvoiceNumber: row.issuedInvoiceNumber };
  },
);
