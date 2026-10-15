// Bank accounts as the VAT register and haulier invoices write them: a Czech account
// "prefix-number/bank" ("19-2000145399/0800", the prefix optional) or an IBAN. Kept normalised
// (no spaces, no leading zeros, IBAN in capitals) so two spellings of one account compare equal.
// Tested in bankAccounts.test.ts.

const CZ_PATTERN = /^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/;
const IBAN_PATTERN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

const PREFIX_WEIGHTS = [10, 5, 8, 4, 2, 1];
const NUMBER_WEIGHTS = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1];

/** The Czech modulo-11 check of a prefix or account number (weights of the ČNB decree). */
function mod11(digits: string, weights: readonly number[]): boolean {
  const padded = digits.padStart(weights.length, "0");
  const sum = [...padded].reduce((acc, d, i) => acc + Number(d) * weights[i]!, 0);
  return sum % 11 === 0;
}

/** The ISO 13616 check: the IBAN read as a number gives 1 modulo 97. */
function ibanChecks(iban: string): boolean {
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const value = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const digit of value) rest = (rest * 10 + Number(digit)) % 97;
  }
  return rest === 1;
}

const stripZeros = (digits: string) => digits.replace(/^0+(?=\d)/, "");

/** One spelling of an account: spaces gone, leading zeros dropped, an IBAN in capitals. Not checked. */
export function normaliseBankAccount(input: string): string {
  const compact = input.replace(/\s+/g, "").toUpperCase();
  const cz = compact.match(CZ_PATTERN);
  if (!cz) return compact;
  const [, prefix, number, bank] = cz;
  const p = prefix ? stripZeros(prefix) : "";
  return `${p && p !== "0" ? `${p}-` : ""}${stripZeros(number!)}/${bank}`;
}

/** Why an account cannot be used, or null when it is a valid Czech account or IBAN. */
export function bankAccountProblem(input: string): string | null {
  const value = normaliseBankAccount(input);
  if (!value) return "Enter the bank account";
  const cz = value.match(CZ_PATTERN);
  if (cz) {
    const [, prefix, number] = cz;
    if (prefix && !mod11(prefix, PREFIX_WEIGHTS)) return "The account prefix does not pass the Czech check digit";
    if (!mod11(number!, NUMBER_WEIGHTS)) return "The account number does not pass the Czech check digit";
    return null;
  }
  if (/^[A-Z]{2}/.test(value)) {
    if (!IBAN_PATTERN.test(value)) return "Not an IBAN: two letters, two check digits, then the account";
    if (value.startsWith("CZ") && value.length !== 24) return "A Czech IBAN has 24 characters";
    if (!ibanChecks(value)) return "The IBAN's check digits do not match";
    return null;
  }
  return "Write it as prefix-number/bank (e.g. 19-2000145399/0800) or as an IBAN";
}

/** "CZ65 0800 0000 1920 0014 5399" for an IBAN, the Czech form as it is. */
export function formatBankAccount(input: string): string {
  const value = normaliseBankAccount(input);
  if (CZ_PATTERN.test(value)) return value;
  return value.replace(/(.{4})/g, "$1 ").trim();
}

/** A Czech IBAN in the Czech form (CZkk BBBB PPPPPP NNNNNNNNNN → prefix-number/bank), others as they are. */
function comparable(input: string): string {
  const value = normaliseBankAccount(input);
  if (!/^CZ\d{22}$/.test(value)) return value;
  return normaliseBankAccount(`${value.slice(8, 14)}-${value.slice(14)}/${value.slice(4, 8)}`);
}

/** Whether an account is one of the published ones, however either is spelled (a Czech IBAN equals its Czech form). */
export const isPublishedAccount = (account: string, published: readonly string[]) => {
  const value = comparable(account);
  return !!value && published.some((p) => comparable(p) === value);
};
