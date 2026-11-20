import type { ImportInstructionAnswers, ImportInstructionChange, ImportInstructionShipmentValues } from "../interfaces/importInstructions";

// The Import Instructions a customer fills in through a link. Pure, so it is unit-tested.

/** How long a link can be used. */
export const IMPORT_LINK_DAYS = 14;

/** The one answer to every link that doesn't open: nobody learns which ones existed. */
export const IMPORT_LINK_INVALID = "This link is no longer valid";

export const IMPORT_DOCUMENT_TYPE = "Import Instructions";

export const importInstructionsUrl = (appUrl: string, token: string) => `${appUrl.replace(/\/+$/, "")}/import-instructions/${token}`;

/** Only an import is asked; one whose Trade Direction isn't set yet may turn out to be. */
export const mayAskImportInstructions = (tradeDirection: string | null | undefined): boolean => /^(imp|$)/i.test((tradeDirection ?? "").trim());

const LIMITS: Record<Exclude<keyof ImportInstructionAnswers, "procedure" | "dutyPaidBy">, number> = {
  bank: 200,
  accountNumber: 100,
  t1Office: 200,
  otherProcedure: 300,
  tariffCode: 50,
  description: 2000,
  whatIsIt: 500,
  madeOf: 500,
  usedFor: 500,
  deliveryAddress: 500,
  deliveryContact: 200,
  deliveryPhone: 50,
  deliveryNotes: 500,
  billingAddress: 500,
  eori: 30,
  companyId: 50,
  vatId: 30,
  name: 200,
  telephone: 50,
};

/** The answers in the form they are kept: every text trimmed and within its limit, whatever was sent. */
export function normalizeAnswers(raw: Partial<ImportInstructionAnswers>): ImportInstructionAnswers {
  const text = (key: keyof typeof LIMITS) => String(raw[key] ?? "").trim().slice(0, LIMITS[key]);
  const procedure = raw.procedure === "free_circulation" || raw.procedure === "t1" || raw.procedure === "other" || raw.procedure === "own_broker" ? raw.procedure : "";
  const dutyPaidBy = raw.dutyPaidBy === "us" || raw.dutyPaidBy === "own_account" ? raw.dutyPaidBy : "";
  // Paid by us, the customer's bank isn't asked, so none sent anyway (a direct call, an old page) is kept.
  const paidByUs = dutyPaidBy === "us";
  return {
    procedure,
    dutyPaidBy,
    bank: paidByUs ? "" : text("bank"),
    accountNumber: paidByUs ? "" : text("accountNumber"),
    t1Office: text("t1Office"),
    otherProcedure: text("otherProcedure"),
    tariffCode: text("tariffCode"),
    description: text("description"),
    whatIsIt: text("whatIsIt"),
    madeOf: text("madeOf"),
    usedFor: text("usedFor"),
    deliveryAddress: text("deliveryAddress"),
    deliveryContact: text("deliveryContact"),
    deliveryPhone: text("deliveryPhone"),
    deliveryNotes: text("deliveryNotes"),
    billingAddress: text("billingAddress"),
    eori: text("eori"),
    companyId: text("companyId"),
    vatId: text("vatId"),
    name: text("name"),
    telephone: text("telephone"),
  };
}

export const ACCOUNT_FORMAT_PROBLEM = "Enter the account number as 19-2000145399/0800 or as an IBAN";

/**
 * Whether an account number reads as one: a Czech account (prefix-number/bank code, the prefix optional, as
 * 19-2000145399/0800) or an IBAN whose own check digits add up (ISO 13616: the number mod 97 is 1). The form
 * is public, so anything else is refused rather than kept.
 */
export function isAccountNumber(value: string): boolean {
  const v = value.trim();
  if (/^(\d{1,6}-)?\d{2,10}\/\d{4}$/.test(v)) return true;
  const iban = v.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1;
}

/** We classify the goods from the three questions: when no tariff code is given and we clear them. */
export const needsClassification = (a: Pick<ImportInstructionAnswers, "procedure" | "tariffCode">): boolean => !a.tariffCode && a.procedure !== "own_broker";

/**
 * What is still missing from the form; null when it is complete. `fromCustomer` is the public submit: what a
 * customer sends now is checked in full, while a form already sent is answered as it was sent.
 */
export function answersProblem(a: ImportInstructionAnswers, isListedOffice: (office: string) => boolean, { fromCustomer = false }: { fromCustomer?: boolean } = {}): string | null {
  if (!a.procedure) return "Choose the customs procedure";
  if (a.procedure === "free_circulation") {
    // The bank is asked only when the duty and VAT are paid from the customer's own account (owner, Q16). A
    // form sent before the question gave the account instead, and stands as it was.
    if (!a.dutyPaidBy && (!a.bank || !a.accountNumber)) return "Say who pays the duty and VAT";
    if (a.dutyPaidBy === "own_account" && (!a.bank || !a.accountNumber)) return "Fill in the bank and the account number";
    if (a.dutyPaidBy === "own_account" && !isAccountNumber(a.accountNumber)) return ACCOUNT_FORMAT_PROBLEM;
    // The same answer without the question still comes from a page opened before it was added, or from a
    // direct call. It is taken, so a customer on an old page can still send the form; but its account is
    // checked as any other, so the question can't be skipped to send any text as an account.
    if (fromCustomer && !a.dutyPaidBy && !isAccountNumber(a.accountNumber)) return ACCOUNT_FORMAT_PROBLEM;
  }
  if (a.procedure === "t1" && !isListedOffice(a.t1Office)) return "Choose the customs office of destination from the list";
  if (!a.description) return "Describe the goods";
  // Without a code the goods are classified from these - by us; a customer who clears them itself (or
  // through its own broker) classifies them there.
  if (needsClassification(a) && (!a.whatIsIt || !a.madeOf || !a.usedFor)) return "Without a customs tariff code, say what the goods are, what they are made of and what they are used for";
  if (!a.billingAddress) return "Fill in the billing address";
  if (!a.name || !a.telephone) return "Fill in your name and telephone";
  return null;
}

/** How each answer is named on the form and in the PDF. */
export const ANSWER_LABELS: Record<keyof ImportInstructionAnswers, string> = {
  procedure: "Customs procedure",
  dutyPaidBy: "Duty and VAT paid by",
  bank: "Bank",
  accountNumber: "Account number",
  t1Office: "Customs office of destination",
  otherProcedure: "Procedure",
  tariffCode: "Customs tariff code",
  description: "Description of the goods",
  whatIsIt: "What is it?",
  madeOf: "What is it made of?",
  usedFor: "What is it used for?",
  deliveryAddress: "Delivery address",
  deliveryContact: "Delivery contact person",
  deliveryPhone: "Delivery telephone",
  deliveryNotes: "Delivery time window and unloading notes",
  billingAddress: "Billing address",
  eori: "EORI",
  companyId: "Company ID",
  vatId: "VAT ID",
  name: "Confirmed by",
  telephone: "Telephone",
};

const PROCEDURE_TEXT: Record<ImportInstructionAnswers["procedure"], string> = {
  "": "",
  free_circulation: "a) Release for free circulation (SAD)",
  t1: "b) T1 transit",
  other: "c) Customs warehousing (SAD) or another procedure",
  own_broker: "d) We clear the goods through customs ourselves or through our own broker",
};

/** The procedure as the form and the PDF say it. */
export const procedureText = (procedure: ImportInstructionAnswers["procedure"]): string => PROCEDURE_TEXT[procedure];

/** What otherProcedure holds, by the procedure: the other procedure's name, or the customer's own broker. */
export const otherProcedureLabel = (procedure: ImportInstructionAnswers["procedure"]): string => (procedure === "own_broker" ? "Customs broker" : ANSWER_LABELS.otherProcedure);

export const DUTY_PAID_BY_TEXT: Record<ImportInstructionAnswers["dutyPaidBy"], string> = {
  "": "",
  us: "Us, invoiced to you",
  own_account: "From your own account",
};

/** An answer as it reads: the procedure and who pays the duty in words, every other one as it is. */
export const answerText = (key: keyof ImportInstructionAnswers, a: ImportInstructionAnswers): string =>
  key === "procedure" ? PROCEDURE_TEXT[a.procedure] : key === "dutyPaidBy" ? DUTY_PAID_BY_TEXT[a.dutyPaidBy] : a[key];

/** What the reviewer changed of what the customer sent, in the form's order; [] when nothing. */
export function changedAnswers(sent: ImportInstructionAnswers, approved: ImportInstructionAnswers): ImportInstructionChange[] {
  return (Object.keys(ANSWER_LABELS) as (keyof ImportInstructionAnswers)[])
    .filter((key) => sent[key] !== approved[key])
    .map((key) => ({ field: key, label: ANSWER_LABELS[key], sent: answerText(key, sent), approved: answerText(key, approved) }));
}

/** The shipment's Customs Procedure a form's choice means; "" for one it has no value for. */
export function shipmentProcedureOf(procedure: ImportInstructionAnswers["procedure"]): string {
  return procedure === "free_circulation" ? "JSD" : procedure === "t1" ? "T1" : "";
}

/**
 * What approved answers write to the shipment: only fields still empty, nothing already filled in is
 * replaced. A T1 office is written only under a T1. The delivery contact, telephone and notes go beside the
 * Delivery Address (the consignee's Contact, Delivery Phone, Delivery Notes), so they reach whoever plans
 * the delivery and the Trucking order made from the job (User Council E5).
 */
export function fieldsToFill(shipment: ImportInstructionShipmentValues, a: ImportInstructionAnswers): Partial<ImportInstructionShipmentValues> {
  const out: Partial<ImportInstructionShipmentValues> = {};
  const procedure = shipmentProcedureOf(a.procedure);
  if (!shipment.customsProcedure.trim() && procedure) out.customsProcedure = procedure;
  const isT1 = (out.customsProcedure ?? shipment.customsProcedure).trim().toUpperCase() === "T1";
  if (a.procedure === "t1" && isT1 && !shipment.customsOffice.trim() && a.t1Office) out.customsOffice = a.t1Office;
  if (!shipment.hsCode.trim() && a.tariffCode) out.hsCode = a.tariffCode;
  if (!shipment.deliveryAddress.trim() && a.deliveryAddress) out.deliveryAddress = a.deliveryAddress;
  if (!shipment.consigneeContact.trim() && a.deliveryContact) out.consigneeContact = a.deliveryContact;
  if (!shipment.deliveryPhone.trim() && a.deliveryPhone) out.deliveryPhone = a.deliveryPhone;
  if (!shipment.deliveryNotes.trim() && a.deliveryNotes) out.deliveryNotes = a.deliveryNotes;
  return out;
}
