// Finance → Accounts Payable (Council Outlay 9) seen from a shipment: the invoices this shipment's buying lines are
// on, for a claim on costs to name (D15). Pure, so it is unit-tested. Where one invoice opens: lib/accountsPayable.

/** What a buying line tells about the supplier invoice it is on. */
interface InvoicedLine {
  supplierInvoiceId: string | null;
  vendor: string;
  invoiceNumber: string;
  realCurrency: string;
}

export interface SupplierInvoiceOption {
  value: string;
  /** "Vendor · number", as the invoice is known on the job. */
  label: string;
  vendor: string;
  invoiceNumber: string;
  /** The currency its first line is billed in: what a claim on it is most likely in. */
  currency: string;
}

/**
 * The supplier invoices a shipment's buying lines are on, once each (an invoice of several charges has several
 * lines), in the order of the lines. A line with no invoice yet names none.
 */
export function supplierInvoiceOptions(lines: readonly InvoicedLine[]): SupplierInvoiceOption[] {
  const seen = new Map<string, SupplierInvoiceOption>();
  for (const line of lines) {
    const id = line.supplierInvoiceId;
    if (!id || seen.has(id)) continue;
    const vendor = line.vendor.trim();
    const invoiceNumber = line.invoiceNumber.trim();
    seen.set(id, {
      value: id,
      label: [vendor, invoiceNumber].filter(Boolean).join(" · ") || "Supplier invoice",
      vendor,
      invoiceNumber,
      currency: line.realCurrency,
    });
  }
  return [...seen.values()];
}
