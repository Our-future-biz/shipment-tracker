// Finance → Accounts Payable links, shared by the job's Costs and Claims, a master job's Costs, Document Reading
// and the bell.

/** The Accounts Payable page opened on one supplier invoice. */
export const apInvoiceHref = (supplierInvoiceId: string): string => `/accounts-payable?invoice=${encodeURIComponent(supplierInvoiceId)}`;
