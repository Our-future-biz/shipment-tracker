import { customerInvoiceRepository } from "../repositories/customerInvoice.repository";

interface InvoiceInput {
  invoiceNumber: string;
  amount?: number;
  dueDate?: string;
  status?: string;
  issuedAt?: string;
}

class InvoiceService {
  async listByCustomer(customerId: string, companyId: string) {
    return customerInvoiceRepository.findByCustomer(customerId, companyId);
  }

  async create(companyId: string, customerId: string, input: InvoiceInput) {
    return customerInvoiceRepository.createForCompany(companyId, {
      customerId,
      invoiceNumber: input.invoiceNumber,
      amount: input.amount ?? 0,
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
