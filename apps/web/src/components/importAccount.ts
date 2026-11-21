// The account number on the Import Instructions, checked as the server checks it
// (apps/api/services/shipments/lib/importInstructions.ts): said on the page, before the form is sent.

import { bankAccountProblem, normaliseBankAccount } from "@/app/trucking/_lib/bankAccounts";

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

export const ACCOUNT_FORMAT_PROBLEM = "Check the account number: write it as 19-2000145399/0800 or as an IBAN";

/**
 * A Czech account (prefix-number/bank code, the prefix optional, as 19-2000145399/0800, spaces anywhere)
 * whose prefix and number pass the Czech mod-11 check, the number not all zeros, or an IBAN whose own check
 * digits add up (ISO 13616: mod 97 is 1) - as the server checks it (apps/api/lib/bankAccount).
 */
export function isAccountNumber(value: string): boolean {
  if (bankAccountProblem(value) !== null) return false;
  const czech = /^(?:\d{1,6}-)?(\d+)\//.exec(normaliseBankAccount(value));
  return !czech || /[1-9]/.test(czech[1]!);
}
