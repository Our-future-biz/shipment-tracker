/** What the customer filled in; the sections of the paper form. Every text "" when left empty. */
export interface ImportInstructionAnswers {
  /** 2 a) release for free circulation, b) T1 transit, c) customs warehousing or another procedure. */
  procedure: "" | "free_circulation" | "t1" | "other";
  bank: string;
  accountNumber: string;
  t1Office: string;
  otherProcedure: string;
  /** 3. Combined Nomenclature code. */
  tariffCode: string;
  /** 4. */
  description: string;
  whatIsIt: string;
  madeOf: string;
  usedFor: string;
  /** 5. Only if delivery by our vehicle is required. */
  deliveryAddress: string;
  deliveryContact: string;
  deliveryPhone: string;
  /** 6. */
  billingAddress: string;
  eori: string;
  companyId: string;
  vatId: string;
  /** Who confirmed it. */
  name: string;
  telephone: string;
}

export interface ImportInstructionShipmentValues {
  customsProcedure: string;
  customsOffice: string;
  hsCode: string;
  deliveryAddress: string;
}

/** One answer the reviewer changed before approving: what the customer sent, and what was approved. */
export interface ImportInstructionChange {
  field: keyof ImportInstructionAnswers;
  label: string;
  sent: string;
  approved: string;
}

/** A shipment's latest Import Instructions as the desk sees them. The link itself can't be told again. */
export interface ImportInstructionState {
  status: "open" | "submitted" | "approved" | "rejected";
  /** The link ran out before anybody filled it in. */
  expired: boolean;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  submittedAt: string | null;
  /** What the customer confirmed, as sent. */
  answers: ImportInstructionAnswers | null;
  /** What was approved, as the reviewer left it; null until approved. */
  approvedAnswers: ImportInstructionAnswers | null;
  /** What the reviewer changed of the customer's answers; [] when nothing or not approved yet. */
  changes: ImportInstructionChange[];
  decidedBy: string;
  decidedAt: string | null;
  reason: string;
  /** Whether this user may answer or cancel it: whoever may change the shipment's details. */
  canAnswer: boolean;
  /** What the shipment holds now, to compare. */
  onShipment: ImportInstructionShipmentValues;
}

export interface PublicImportInstructionForm {
  reference: string;
  prefill: Partial<ImportInstructionAnswers>;
}

/** Completed forms waiting for the user: the bell. */
export interface ImportInstructionWaiting {
  shipmentId: string;
  jobNumber: string;
  submittedAt: string;
  filledBy: string;
}
