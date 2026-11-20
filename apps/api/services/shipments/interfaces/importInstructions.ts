/** What the customer filled in; the sections of the paper form. Every text "" when left empty. */
export interface ImportInstructionAnswers {
  /** 2 a) release for free circulation, b) T1 transit, c) customs warehousing or another procedure. */
  procedure: "" | "free_circulation" | "t1" | "other";
  /**
   * Under a): who pays the duty and VAT - we do and invoice them, or they are paid from the customer's own
   * account. Only then are the bank and the account asked (owner, User Council Q16). "" on forms sent before
   * the question was asked, which gave the account instead.
   */
  dutyPaidBy: "" | "us" | "own_account";
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
  /** The delivery time window and unloading notes; "" on forms sent before the box was there. */
  deliveryNotes: string;
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
  /** The consignee's Contact: the person the delivery is for. */
  consigneeContact: string;
  deliveryPhone: string;
  deliveryNotes: string;
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
  /** Whose form it is, for the customer to know whom to ask; "" when it can't be read. No staff names. */
  companyName: string;
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
