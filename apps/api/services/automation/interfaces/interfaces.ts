export interface AutomationLogItem {
  id: string;
  shipmentId: string;
  ruleName: string;
  action: string;
  details: unknown;
  triggeredById: string | null;
  createdAt: string;
}

/** A change to a watched field of a shipment (department, status, holiday cover). */
export interface FieldChange {
  shipmentId: string;
  /** the column's title as shown in the shipments table */
  column: string;
  oldValue: string;
  newValue: string;
  /** the row as the client saw it, kept with the log entry */
  shipmentData?: Record<string, string>;
}
