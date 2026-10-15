import { APIError } from "encore.dev/api";
import { assertShipmentExists } from "../../../lib/shipmentRefs";
import { definedOnly, toDecimal } from "../lib/amounts";
import { customsInvoiceLineRepository, customsInvoiceRepository } from "../repositories/customsInvoice.repository";
import type { CustomsInvoiceLineRecord } from "../schemas/customsInvoice.schema";
import type { CustomsInvoiceLineInput, CustomsInvoiceLineItem, CustomsInvoicingItem } from "../interfaces/interfaces";

// Invoicing tab of a shipment opened in Customs: lines of Category, Currency and Value,
// and one Issued Invoice Number for the whole shipment.

const toItem = (r: CustomsInvoiceLineRecord): CustomsInvoiceLineItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  category: r.category,
  currency: r.currency,
  value: r.value,
  sortOrder: r.sortOrder,
});

// The fields a write actually carries; undefined ones are left as they are. The value is a
// decimal with at most 2 places, or null when cleared.
function lineChanges(input: CustomsInvoiceLineInput) {
  return definedOnly({
    category: input.category?.trim(),
    currency: input.currency?.trim().toUpperCase(),
    value: toDecimal(input.value, "value"),
    sortOrder: input.sortOrder,
  });
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
    const values = { shipmentId, ...lineChanges(input) };
    await assertShipmentExists(shipmentId);
    const line = await customsInvoiceLineRepository.createForCompany(companyId, values);
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
    if (!(await customsInvoiceRepository.getInvoice(shipmentId, companyId))) await assertShipmentExists(shipmentId);
    const row = await customsInvoiceRepository.upsertInvoice(shipmentId, companyId, issuedInvoiceNumber.trim());
    return row.issuedInvoiceNumber;
  }
}

export const customsInvoicingService = new CustomsInvoicingService();
