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

const LIMITS: Record<Exclude<keyof ImportInstructionAnswers, "procedure">, number> = {
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
  const procedure = raw.procedure === "free_circulation" || raw.procedure === "t1" || raw.procedure === "other" ? raw.procedure : "";
  return {
    procedure,
    bank: text("bank"),
    accountNumber: text("accountNumber"),
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
    billingAddress: text("billingAddress"),
    eori: text("eori"),
    companyId: text("companyId"),
    vatId: text("vatId"),
    name: text("name"),
    telephone: text("telephone"),
  };
}

/** What is still missing from the form; null when it is complete. */
export function answersProblem(a: ImportInstructionAnswers, isListedOffice: (office: string) => boolean): string | null {
  if (!a.procedure) return "Choose the customs procedure";
  if (a.procedure === "free_circulation" && (!a.bank || !a.accountNumber)) return "Fill in the bank and the account number";
  if (a.procedure === "t1" && !isListedOffice(a.t1Office)) return "Choose the customs office of destination from the list";
  if (!a.description) return "Describe the goods";
  // Without a code the goods are classified from these.
  if (!a.tariffCode && (!a.whatIsIt || !a.madeOf || !a.usedFor)) return "Without a customs tariff code, say what the goods are, what they are made of and what they are used for";
  if (!a.billingAddress) return "Fill in the billing address";
  if (!a.name || !a.telephone) return "Fill in your name and telephone";
  return null;
}

/** How each answer is named on the form and in the PDF. */
export const ANSWER_LABELS: Record<keyof ImportInstructionAnswers, string> = {
  procedure: "Customs procedure",
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
};

/** An answer as it reads: the procedure in words, every other one as it is. */
export const answerText = (key: keyof ImportInstructionAnswers, a: ImportInstructionAnswers): string =>
  key === "procedure" ? PROCEDURE_TEXT[a.procedure] : a[key];

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
 * replaced. A T1 office is written only under a T1.
 */
export function fieldsToFill(shipment: ImportInstructionShipmentValues, a: ImportInstructionAnswers): Partial<ImportInstructionShipmentValues> {
  const out: Partial<ImportInstructionShipmentValues> = {};
  const procedure = shipmentProcedureOf(a.procedure);
  if (!shipment.customsProcedure.trim() && procedure) out.customsProcedure = procedure;
  const isT1 = (out.customsProcedure ?? shipment.customsProcedure).trim().toUpperCase() === "T1";
  if (a.procedure === "t1" && isT1 && !shipment.customsOffice.trim() && a.t1Office) out.customsOffice = a.t1Office;
  if (!shipment.hsCode.trim() && a.tariffCode) out.hsCode = a.tariffCode;
  if (!shipment.deliveryAddress.trim() && a.deliveryAddress) out.deliveryAddress = a.deliveryAddress;
  return out;
}
