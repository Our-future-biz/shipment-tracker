import { czDate, docMoney } from "./invoicePdf";
import type { StatementLanguage } from "./statement";

/**
 * The e-mails Accounts Receivable sends a customer (step 7), in the customer's language (Czech or English): payment
 * reminder 1, reminder 2 and the final notice of one invoice, and the mail a statement goes with. Plain, polite and
 * factual: the invoice, the job, the due day and what is left to pay. Pure, so every text is tested with the facts.
 *
 * TO BE CHECKED: the wording of these texts (above all reminder 2's late-payment interest and the final notice's
 * hand-over for collection) should be read and approved by the company's accountant or lawyer before e-mail from the
 * app is switched on. Nothing here promises a deadline, a fee or an interest rate.
 */

export type ReminderLevel = 1 | 2 | 3;

export interface MailBank {
  bankName: string;
  accountNumber: string;
  iban: string;
  swift: string;
}

export interface ReminderFacts {
  invoiceNumber: string;
  jobNumber: string;
  issueDate: string;
  dueDate: string;
  daysOverdue: number;
  leftToPay: number;
  currency: string;
  /** The variable symbol on the invoice (the job number's digits) */
  paymentReference: string;
  /** The issuer's company name, signed under the mail */
  issuer: string;
  /** The issuer's account in the invoice's currency; null: the account on the invoice */
  bank: MailBank | null;
  /** The invoice's PDF goes with the mail */
  invoiceAttached: boolean;
}

export interface MailText {
  subject: string;
  body: string;
}

/** "1 day", "12 days" / "1 den", "3 dny", "12 dní" */
export function daysText(n: number, language: StatementLanguage): string {
  const days = Math.max(0, Math.trunc(n));
  if (language === "en") return `${days} ${days === 1 ? "day" : "days"}`;
  if (days === 1) return "1 den";
  if (days >= 2 && days <= 4) return `${days} dny`;
  return `${days} dní`;
}

/** The account to pay to, as a sentence part ("account 19-2000145399/0800 (ČSOB), IBAN CZ65 0800 …, SWIFT/BIC GIBACZPX"). */
export function bankText(bank: MailBank | null, language: StatementLanguage): string {
  const parts = bank
    ? [
        bank.accountNumber ? `${language === "cs" ? "účet" : "account"} ${bank.accountNumber}${bank.bankName ? ` (${bank.bankName})` : ""}` : "",
        bank.iban ? `IBAN ${bank.iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim()}` : "",
        bank.swift ? `SWIFT/BIC ${bank.swift}` : "",
      ].filter(Boolean)
    : [];
  if (!parts.length) return language === "cs" ? "účet uvedený na faktuře" : "the account stated on the invoice";
  // An account known only by its IBAN still reads as an account.
  if (!bank?.accountNumber) parts[0] = `${language === "cs" ? "účet" : "account"} ${parts[0]}`;
  return parts.join(", ");
}

const amountOf = (f: { leftToPay: number; currency: string }) => `${docMoney(f.leftToPay)} ${f.currency}`;

function englishReminder(level: ReminderLevel, f: ReminderFacts): MailText {
  const ref = `invoice ${f.invoiceNumber} for job ${f.jobNumber}`;
  const pay = `${bankText(f.bank, "en")}, with the payment reference ${f.paymentReference || f.jobNumber}`;
  const attached = f.invoiceAttached ? "The invoice is attached. " : "";
  const sign = `Kind regards\n${f.issuer}`;
  if (level === 1) {
    return {
      subject: `Payment reminder: invoice ${f.invoiceNumber} (job ${f.jobNumber})`,
      body: [
        "Dear Sir or Madam,",
        `our records show that ${ref}, issued on ${czDate(f.issueDate)} and due on ${czDate(f.dueDate)}, has not been paid in full yet. ${amountOf(f)} is left to pay (${daysText(f.daysOverdue, "en")} overdue).`,
        `If you have paid it in the meantime, thank you, and please disregard this reminder. Otherwise please pay the amount to ${pay}.`,
        `${attached}If anything about it is unclear, please reply to this e-mail.`,
        sign,
      ].join("\n\n"),
    };
  }
  if (level === 2) {
    return {
      subject: `Second payment reminder: invoice ${f.invoiceNumber} (job ${f.jobNumber})`,
      body: [
        "Dear Sir or Madam,",
        `we have reminded you of ${ref} before, and it is still not paid in full: ${amountOf(f)} is left to pay, ${daysText(f.daysOverdue, "en")} after its due day ${czDate(f.dueDate)}.`,
        `Please pay the amount without further delay to ${pay}. Please note that late-payment interest may be charged on the overdue amount.`,
        `If you have paid it in the meantime, please disregard this reminder. If there is a reason the invoice cannot be paid, please reply to this e-mail so that we can settle it. ${attached}`.trim(),
        sign,
      ].join("\n\n"),
    };
  }
  return {
    subject: `Final notice: invoice ${f.invoiceNumber} (job ${f.jobNumber})`,
    body: [
      "Dear Sir or Madam,",
      `despite our earlier reminders, ${ref}, due on ${czDate(f.dueDate)}, is still not paid in full: ${amountOf(f)} is left to pay (${daysText(f.daysOverdue, "en")} overdue).`,
      `This is our final notice. Please pay the amount at once to ${pay}. If it is not paid, the matter may be handed over for collection, and late-payment interest may be charged on the overdue amount.`,
      `If you have paid it in the meantime, please disregard this notice. ${attached}`.trim(),
      sign,
    ].join("\n\n"),
  };
}

function czechReminder(level: ReminderLevel, f: ReminderFacts): MailText {
  const ref = `faktura ${f.invoiceNumber} k zakázce ${f.jobNumber}`;
  const pay = `${bankText(f.bank, "cs")} s variabilním symbolem ${f.paymentReference || f.jobNumber}`;
  const attached = f.invoiceAttached ? "Fakturu přikládáme. " : "";
  const sign = `S pozdravem\n${f.issuer}`;
  if (level === 1) {
    return {
      subject: `Upomínka: faktura ${f.invoiceNumber} (zakázka ${f.jobNumber})`,
      body: [
        "Dobrý den,",
        `podle našich záznamů nebyla ${ref}, vystavená ${czDate(f.issueDate)} se splatností ${czDate(f.dueDate)}, dosud uhrazena v plné výši. Zbývá uhradit ${amountOf(f)} (${daysText(f.daysOverdue, "cs")} po splatnosti).`,
        `Pokud jste platbu mezitím odeslali, děkujeme a tuto upomínku prosím považujte za bezpředmětnou. V opačném případě Vás prosíme o úhradu na ${pay}.`,
        `${attached}V případě nejasností nám prosím odpovězte na tento e-mail.`,
        sign,
      ].join("\n\n"),
    };
  }
  if (level === 2) {
    return {
      subject: `Druhá upomínka: faktura ${f.invoiceNumber} (zakázka ${f.jobNumber})`,
      body: [
        "Dobrý den,",
        `již dříve jsme Vás upozornili, že ${ref} není uhrazena v plné výši. Dosud zbývá uhradit ${amountOf(f)}, ${daysText(f.daysOverdue, "cs")} po splatnosti ${czDate(f.dueDate)}.`,
        `Prosíme Vás o úhradu bez dalšího odkladu na ${pay}. Upozorňujeme, že z dlužné částky může být účtován úrok z prodlení.`,
        `Pokud jste platbu mezitím odeslali, tuto upomínku prosím považujte za bezpředmětnou. Pokud fakturu z nějakého důvodu nelze uhradit, odpovězte nám prosím na tento e-mail, abychom věc mohli vyřešit. ${attached}`.trim(),
        sign,
      ].join("\n\n"),
    };
  }
  return {
    subject: `Poslední výzva k úhradě: faktura ${f.invoiceNumber} (zakázka ${f.jobNumber})`,
    body: [
      "Dobrý den,",
      `přes naše předchozí upomínky není ${ref} se splatností ${czDate(f.dueDate)} dosud uhrazena v plné výši: zbývá uhradit ${amountOf(f)} (${daysText(f.daysOverdue, "cs")} po splatnosti).`,
      `Toto je naše poslední výzva. Prosíme Vás o okamžitou úhradu na ${pay}. Nebude-li částka uhrazena, může být věc předána k vymáhání a z dlužné částky může být účtován úrok z prodlení.`,
      `Pokud jste platbu mezitím odeslali, tuto výzvu prosím považujte za bezpředmětnou. ${attached}`.trim(),
      sign,
    ].join("\n\n"),
  };
}

/** The subject and body of reminder 1, 2 or the final notice (3) of one invoice, in the customer's language. */
export function reminderText(level: ReminderLevel, language: StatementLanguage, facts: ReminderFacts): MailText {
  return language === "cs" ? czechReminder(level, facts) : englishReminder(level, facts);
}

export interface StatementMailFacts {
  currency: string;
  asAt: string;
  invoices: number;
  leftToPay: number;
  overdue: number;
  issuer: string;
  bank: MailBank | null;
}

/** The mail a statement (attached as a PDF) goes with, in the customer's language. */
export function statementMailText(language: StatementLanguage, f: StatementMailFacts): MailText {
  const total = amountOf({ leftToPay: f.leftToPay, currency: f.currency });
  if (language === "cs") {
    const overdue = f.overdue > 0 ? `, z toho po splatnosti ${amountOf({ leftToPay: f.overdue, currency: f.currency })}` : "";
    return {
      subject: `Výpis otevřených položek (${f.currency}) k ${czDate(f.asAt)}`,
      body: [
        "Dobrý den,",
        `v příloze Vám zasíláme výpis Vašich neuhrazených faktur v ${f.currency} k ${czDate(f.asAt)}: počet faktur ${f.invoices}, zbývá uhradit ${total}${overdue}.`,
        `Pokud jste některé z nich mezitím uhradili, děkujeme. Ostatní prosím uhraďte na ${bankText(f.bank, "cs")}, vždy s variabilním symbolem uvedeným na faktuře (číslice čísla zakázky).`,
        "V případě nejasností nám prosím odpovězte na tento e-mail.",
        `S pozdravem\n${f.issuer}`,
      ].join("\n\n"),
    };
  }
  const overdue = f.overdue > 0 ? `, of which ${amountOf({ leftToPay: f.overdue, currency: f.currency })} is overdue` : "";
  return {
    subject: `Statement of open invoices (${f.currency}) as at ${czDate(f.asAt)}`,
    body: [
      "Dear Sir or Madam,",
      `please find attached the statement of your invoices not yet paid in ${f.currency} as at ${czDate(f.asAt)}: ${f.invoices} ${f.invoices === 1 ? "invoice" : "invoices"}, ${total} left to pay${overdue}.`,
      `If you have paid any of them in the meantime, thank you. Please pay the others to ${bankText(f.bank, "en")}, each with the payment reference on its invoice (the job number's digits).`,
      "If anything is unclear, please reply to this e-mail.",
      `Kind regards\n${f.issuer}`,
    ].join("\n\n"),
  };
}
