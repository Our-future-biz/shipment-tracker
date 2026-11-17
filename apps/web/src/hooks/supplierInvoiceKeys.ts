// Finance → Accounts Payable (Council Outlay 9): the query keys of supplier invoices, shared by the page, the
// bell, Billing approvals, Document Reading and Costs Breakdown. Invalidating `all` refreshes every one of them.
export const supplierInvoiceKeys = {
  all: ["supplier-invoices"] as const,
  list: ["supplier-invoices", "list"] as const,
  detail: (id: string) => ["supplier-invoices", "detail", id] as const,
  forMe: ["supplier-invoices", "for-me"] as const,
};
