import { APIError } from "encore.dev/api";
import { customerInvoiceRepository } from "../repositories/customerInvoice.repository";
import type { NewCustomerInvoiceRecord } from "../schemas/customerInvoice.schema";
import type { InvoiceItem, InvoiceStatus } from "../interfaces/interfaces";
import { dateInput } from "../lib/dates";
import { toInvoiceItem } from "../lib/mappers";
import { customerService } from "./customer.service";

export interface InvoiceInput {
  invoiceNumber: string;
  amount?: number;
  dueDate?: string;
  status?: InvoiceStatus;
  issuedAt?: string;
}

class InvoiceService {
  async listByCustomer(customerId: string, companyId: string): Promise<InvoiceItem[]> {
    return (await customerInvoiceRepository.findByCustomer(customerId, companyId)).map(toInvoiceItem);
  }

  async create(companyId: string, customerId: string, input: InvoiceInput): Promise<InvoiceItem> {
    await customerService.requireLive(customerId, companyId);
    const values: Omit<NewCustomerInvoiceRecord, "companyId"> = {
      customerId,
      invoiceNumber: input.invoiceNumber,
      amount: input.amount ?? 0,
      dueDate: dateInput(input.dueDate, "dueDate") ?? null,
      status: input.status ?? "Open",
      issuedAt: dateInput(input.issuedAt, "issuedAt") ?? null,
    };
    const row = await customerInvoiceRepository.createForCompany(companyId, values);
    return toInvoiceItem(row);
  }

  async update(id: string, companyId: string, input: Partial<InvoiceInput>): Promise<InvoiceItem> {
    const patch: Partial<NewCustomerInvoiceRecord> = {};
    if (input.invoiceNumber !== undefined) patch.invoiceNumber = input.invoiceNumber;
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.status !== undefined) patch.status = input.status;
    const dueDate = dateInput(input.dueDate, "dueDate");
    if (dueDate !== undefined) patch.dueDate = dueDate;
    const issuedAt = dateInput(input.issuedAt, "issuedAt");
    if (issuedAt !== undefined) patch.issuedAt = issuedAt;
    const row = await customerInvoiceRepository.updateForCompany(id, companyId, patch);
    if (!row) throw APIError.notFound("Invoice not found");
    return toInvoiceItem(row);
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    if (!(await customerInvoiceRepository.softDeleteForCompany(id, companyId))) throw APIError.notFound("Invoice not found");
  }
}

export const invoiceService = new InvoiceService();
