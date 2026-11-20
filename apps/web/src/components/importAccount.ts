// The account number on the Import Instructions, checked as the server checks it
// (apps/api/services/shipments/lib/importInstructions.ts): said on the page, before the form is sent.

/**
 * Under a) Release for free circulation: whether the bank and the account are asked, and whether "Duty and
 * VAT paid by" must be answered. The bank is asked only when they are paid from the customer's own account
 * (owner, User Council Q16). A form sent before the question gave the account instead: its account shows,
 * and with both boxes filled it stands as it was, as the server takes it.
 */
export function accountQuestions(dutyPaidBy: string | undefined, bank: string | undefined, accountNumber: string | undefined): { asksAccount: boolean; mustSayWhoPays: boolean } {
  const given = [bank, accountNumber].map((v) => !!v?.trim());
  if (dutyPaidBy) return { asksAccount: dutyPaidBy === "own_account", mustSayWhoPays: true };
  return { asksAccount: given.some(Boolean), mustSayWhoPays: !given.every(Boolean) };
}

export const ACCOUNT_FORMAT_PROBLEM = "Enter the account number as 19-2000145399/0800 or as an IBAN";

/**
 * A Czech account (prefix-number/bank code, the prefix optional, as 19-2000145399/0800) or an IBAN whose
 * own check digits add up (ISO 13616: the number mod 97 is 1).
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
