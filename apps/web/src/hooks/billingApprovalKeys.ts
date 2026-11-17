// Partial credit notes and invoice changes on their issue day: asked from the invoice, answered on Sales →
// Managers → Billing approvals. Their query keys, shared by the invoice panel, the managers' list and the bell;
// invalidating a group's `all` refreshes every view of it.

export const creditNoteRequestKeys = {
  all: ["credit-note-requests"] as const,
  list: ["credit-note-requests", "list"] as const,
  forMe: ["credit-note-requests", "for-me"] as const,
  ofShipment: (shipmentId: string) => ["credit-note-requests", "shipment", shipmentId] as const,
};

/** What is left of each line of an invoice to credit (the credit dialog). */
export const creditOptionsKeys = {
  all: ["credit-options"] as const,
  of: (invoiceId: string) => ["credit-options", invoiceId] as const,
};

export const invoiceChangeRequestKeys = {
  all: ["invoice-change-requests"] as const,
  list: ["invoice-change-requests", "list"] as const,
  forMe: ["invoice-change-requests", "for-me"] as const,
  ofShipment: (shipmentId: string) => ["invoice-change-requests", "shipment", shipmentId] as const,
};
