// Phase 6 part C: internal billing. A consignment on a job of another department is charged to
// that department from the Internal tariff, month by month (see lib/internalRules.ts).

export type InternalChargeKind = "CHARGE" | "EXCEPTION" | "ADJUSTMENT";

export interface InternalCharge {
  id: string;
  /** "2026-10" */
  month: string;
  consignmentId: string;
  consignmentRef: string;
  shipmentId: string;
  jobNumber: string;
  /** The receiving department (the job's) */
  department: string;
  /** ISO, the consignment's delivery */
  deliveredAt: string;
  serviceLevel: string | null;
  chargeableKg: number | null;
  tariffVersionId: string | null;
  amount: number;
  currency: "CZK";
  kind: InternalChargeKind;
  /** Starts with "Not priced" when no Internal tariff priced it (needs attention) */
  description: string;
  createdAt: string;
}

export interface InternalMonth {
  month: string;
  status: "OPEN" | "CLOSED";
  closedAt: string | null;
  /** Display name */
  closedBy: string | null;
  totals: { department: string; count: number; amount: number }[];
  statementNumbers: string[];
}

export interface InternalStatement {
  /** "ICZ20260001" */
  number: string;
  month: string;
  department: string;
  issuedAt: string;
  amount: number;
  lineCount: number;
}
