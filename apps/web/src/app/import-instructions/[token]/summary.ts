import type { ImportAnswers } from "@/components/ImportInstructionsFields";

// What the customer sees after sending the Import Instructions: its answers, in the form's order, to
// read or print from the page (user council E12: the customer kept no copy; nothing is downloaded).
// The words are the server's (shipments lib/importInstructions ANSWER_LABELS and the procedure texts)
// so the page, the filed PDF and the reviewer say the same. Pure, tested in summary.test.ts.

const PROCEDURE_TEXT: Record<ImportAnswers["procedure"], string> = {
  "": "",
  free_circulation: "a) Release for free circulation (SAD)",
  t1: "b) T1 transit",
  other: "c) Customs warehousing (SAD) or another procedure",
  own_broker: "d) We clear the goods through customs ourselves or through our own broker",
};

const DUTY_PAID_BY_TEXT: Record<ImportAnswers["dutyPaidBy"], string> = { "": "", us: "Us, invoiced to you", own_account: "From your own account" };

const LABELS: Record<keyof ImportAnswers, string> = {
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

/** Every answer given, labelled, in the form's order; one left empty is not listed. */
export function answerSummary(a: ImportAnswers): { key: keyof ImportAnswers; label: string; value: string }[] {
  return (Object.keys(LABELS) as (keyof ImportAnswers)[])
    .map((key) => {
      const value = key === "procedure" ? PROCEDURE_TEXT[a.procedure] : key === "dutyPaidBy" ? DUTY_PAID_BY_TEXT[a.dutyPaidBy] : a[key];
      const label = key === "otherProcedure" && a.procedure === "own_broker" ? "Customs broker" : LABELS[key];
      return { key, label, value: value.trim() };
    })
    .filter((row) => row.value);
}

/** How the customer reaches us: the company's phone and e-mail, as the tracking page gives them (mock council S3-2). */
export interface OurContact {
  companyName?: string | null;
  ourPhone?: string | null;
  ourEmail?: string | null;
}

// The company's name, then its phone and e-mail in brackets when known: "Austromar s.r.o. (+420 222 333 444, ops@austromar.cz)".
const whom = (our: OurContact, fallback: string): string => {
  const ways = [our.ourPhone, our.ourEmail].map((v) => v?.trim() ?? "").filter(Boolean);
  const name = our.companyName?.trim() || fallback;
  return ways.length ? `${name} (${ways.join(", ")})` : name;
};

/** The header's line on whom to ask about the form. */
export const questionsText = (our: OurContact): string => `Questions: contact ${whom(our, "whoever sent you this link")}`.replace(/\.?$/, ".");

/** Whom to ask for a new link: the company that sent it when the server names it, with its phone and e-mail. */
export const askForNewLink = (our: OurContact | null | undefined): string => `Please ask ${whom(our ?? {}, "your contact")} for a new one.`;

/** Why a link no longer opens, and whom to ask. A bare name is taken as the company's. */
export const usedLinkText = (our: OurContact | string | null | undefined): string =>
  `It was already used, it has expired or it was cancelled. ${askForNewLink(typeof our === "string" ? { companyName: our } : our)}`;
