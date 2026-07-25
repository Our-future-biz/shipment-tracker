import { customerInvoiceRepository } from "../repositories/customerInvoice.repository";

interface InvoiceInput {
  invoiceNumber: string;
  amount?: number;
  dueDate?: string;
  status?: string;
  issuedAt?: string;
}

class InvoiceService {
  async listByCustomer(customerId: string) {
    return customerInvoiceRepository.findByCustomer(customerId);
  }

  async create(customerId: string, input: InvoiceInput) {
    return customerInvoiceRepository.create({
      customerId,
      invoiceNumber: input.invoiceNumber,
      amount: input.amount ?? 0,
      dueDate: input.dueDate ?? "",
      status: input.status ?? "Open",
      issuedAt: input.issuedAt ?? "",
    } as never);
  }

  async update(id: string, input: Partial<InvoiceInput>) {
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) patch[key] = value;
    }
    return customerInvoiceRepository.update(id, patch as never);
  }

  async softDelete(id: string) {
    return customerInvoiceRepository.softDelete(id);
  }
}

export const invoiceService = new InvoiceService();
