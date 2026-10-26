// A gate record linked to a shipment shows the shipment's Customer and Customer's PIC. When those
// change on the shipment (an edit, or a rename in the Customer Database), the record follows —
// released and left records too: the names are who the customer is, not what was declared.
// Pure, so it is tested without the database.

export interface GateParties {
  customer: string;
  customerContact: string;
}

export interface PartiesChange {
  changes: Partial<GateParties>;
  /** "Customer: old → new; Customer contact: old → new" for the gate log. */
  detail: string;
}

const shown = (v: string) => (v ? `"${v}"` : "—");

/** What a record must change to show the shipment's current parties; null when nothing differs. */
export function partiesChange(current: GateParties, shipment: GateParties): PartiesChange | null {
  const changes: Partial<GateParties> = {};
  const details: string[] = [];
  if (current.customer !== shipment.customer) {
    changes.customer = shipment.customer;
    details.push(`Customer: ${shown(current.customer)} → ${shown(shipment.customer)}`);
  }
  if (current.customerContact !== shipment.customerContact) {
    changes.customerContact = shipment.customerContact;
    details.push(`Customer contact: ${shown(current.customerContact)} → ${shown(shipment.customerContact)}`);
  }
  return details.length ? { changes, detail: details.join("; ") } : null;
}
