import { customerInvoiceRepository } from "../repositories/customerInvoice.repository";
import { customerRepository } from "../repositories/customer.repository";

interface InvoiceInput {
  invoiceNumber: string;
  amount?: number;
  currency?: string;
  dueDate?: string;
  status?: string;
  issuedAt?: string;
}

class InvoiceService {
  async listByCustomer(customerId: string, companyId: string) {
    return customerInvoiceRepository.findByCustomer(customerId, companyId);
  }

  async create(companyId: string, customerId: string, input: InvoiceInput) {
    // An invoice entered by hand is in the customer's currency (the one its credit limit is in);
    // Invoicing always sends the currency of the issued invoice.
    const currency = input.currency || (await customerRepository.getByIdForCompany(customerId, companyId))?.currency || "CZK";
    return customerInvoiceRepository.createForCompany(companyId, {
      customerId,
      invoiceNumber: input.invoiceNumber,
      amount: input.amount ?? 0,
      currency,
      dueDate: input.dueDate ?? "",
      status: input.status ?? "Open",
      issuedAt: input.issuedAt ?? "",
    } as never);
  }

  async update(id: string, companyId: string, input: Partial<InvoiceInput>) {
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) patch[key] = value;
    }
    return customerInvoiceRepository.updateForCompany(id, companyId, patch as never);
  }

  async softDelete(id: string, companyId: string) {
    return customerInvoiceRepository.softDeleteForCompany(id, companyId);
  }
}

export const invoiceService = new InvoiceService();
