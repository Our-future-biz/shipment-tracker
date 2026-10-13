import { APIError } from "encore.dev/api";
import { customsInvoiceLineRepository, customsInvoiceRepository } from "../repositories/customsInvoice.repository";
import type { CustomsInvoiceLineRecord } from "../schemas/customsInvoice.schema";
import type { CustomsInvoiceLineInput, CustomsInvoiceLineItem, CustomsInvoicingItem } from "../interfaces/interfaces";

// Invoicing tab of a shipment opened in Customs: lines of Category, Currency and Value,
// and one Issued Invoice Number for the whole shipment.

// A value as stored: a plain decimal with at most 2 places (numeric(14,2)), or null when
// cleared — Postgres rejects "" for a numeric column. Anything else is refused up front
// instead of failing in the database.
const DECIMAL = /^-?\d{1,12}(\.\d{1,2})?$/;
function toValue(v: string | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  const t = v.trim();
  if (t === "") return null;
  if (!DECIMAL.test(t)) throw APIError.invalidArgument(`"${t}" is not an amount (use e.g. 1250.50)`);
  return t;
}

const toItem = (r: CustomsInvoiceLineRecord): CustomsInvoiceLineItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  category: r.category,
  currency: r.currency,
  value: r.value,
  sortOrder: r.sortOrder,
});

// The fields a write actually carries; undefined ones are left as they are.
function lineChanges(input: CustomsInvoiceLineInput) {
  const changes = {
    category: input.category?.trim(),
    currency: input.currency?.trim().toUpperCase(),
    value: toValue(input.value),
    sortOrder: input.sortOrder,
  };
  return Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)) as Partial<typeof changes>;
}

class CustomsInvoicingService {
  async get(shipmentId: string, companyId: string): Promise<CustomsInvoicingItem> {
    const [lines, invoice] = await Promise.all([
      customsInvoiceLineRepository.listLines(shipmentId, companyId),
      customsInvoiceRepository.getInvoice(shipmentId, companyId),
    ]);
    return { lines: lines.map(toItem), issuedInvoiceNumber: invoice?.issuedInvoiceNumber ?? "" };
  }

  async addLine(shipmentId: string, companyId: string, input: CustomsInvoiceLineInput): Promise<CustomsInvoiceLineItem> {
    const line = await customsInvoiceLineRepository.createForCompany(companyId, { shipmentId, ...lineChanges(input) });
    return toItem(line);
  }

  async updateLine(shipmentId: string, lineId: string, companyId: string, input: CustomsInvoiceLineInput): Promise<CustomsInvoiceLineItem> {
    const line = await customsInvoiceLineRepository.updateLine(lineId, companyId, shipmentId, lineChanges(input));
    if (!line) throw APIError.notFound("Line not found");
    return toItem(line);
  }

  async deleteLine(shipmentId: string, lineId: string, companyId: string): Promise<void> {
    const line = await customsInvoiceLineRepository.softDeleteLine(lineId, companyId, shipmentId);
    if (!line) throw APIError.notFound("Line not found");
  }

  async setIssuedInvoiceNumber(shipmentId: string, companyId: string, issuedInvoiceNumber: string): Promise<string> {
    const row = await customsInvoiceRepository.upsertInvoice(shipmentId, companyId, issuedInvoiceNumber.trim());
    return row.issuedInvoiceNumber;
  }
}

export const customsInvoicingService = new CustomsInvoicingService();
