// Bank accounts as the VAT register and invoices write them, normalised so two spellings of one
// account compare equal: a Czech account "prefix-number/bank" ("000019-0002000145399/0800",
// "19-2000145399 / 0800" → "19-2000145399/0800"; a prefix of 0 is left out), and an IBAN without
// spaces in capitals. A Czech IBAN is the same account as its domestic form, so it is stored in
// the domestic form ("CZ65 0800 0000 1920 0014 5399" → "19-2000145399/0800"). Check digits are
// checked (mod 11 for Czech accounts, mod 97 for IBANs). Pure.

const CZ_PREFIX_WEIGHTS = [10, 5, 8, 4, 2, 1];
const CZ_NUMBER_WEIGHTS = [6, 3, 7, 9, 10, 5, 8, 4, 2, 1];

const mod11ok = (digits: string, weights: number[]): boolean => {
  const padded = digits.padStart(weights.length, "0");
  return padded.split("").reduce((a, d, i) => a + Number(d) * weights[i]!, 0) % 11 === 0;
};

const stripZeros = (s: string) => s.replace(/^0+/, "");

/** A Czech account from its parts, normalised; null when the check digits fail. */
function czAccount(prefix: string, number: string, bank: string): string | null {
  if (!/^\d{0,6}$/.test(prefix) || !/^\d{1,10}$/.test(number) || !/^\d{4}$/.test(bank)) return null;
  const p = stripZeros(prefix);
  const n = stripZeros(number);
  if (!n || n.length < 2) return null;
  if (!mod11ok(p || "0", CZ_PREFIX_WEIGHTS) || !mod11ok(n, CZ_NUMBER_WEIGHTS)) return null;
  return `${p ? `${p}-` : ""}${n}/${bank}`;
}

/** Whether the IBAN's check digits hold (ISO 13616, mod 97). */
function ibanOk(iban: string): boolean {
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

/**
 * The account normalised, or null when it is not a valid Czech account or IBAN. Spaces are
 * ignored; a Czech IBAN comes back in the domestic form.
 */
export function normaliseBankAccount(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.replace(/\s+/g, "").toUpperCase();
  if (!s) return null;
  const cz = /^(?:(\d{1,6})-)?(\d{1,10})\/(\d{4})$/.exec(s);
  if (cz) return czAccount(cz[1] ?? "", cz[2]!, cz[3]!);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s) || !ibanOk(s)) return null;
  if (s.startsWith("CZ")) {
    if (s.length !== 24) return null;
    return czAccount(s.slice(8, 14), s.slice(14), s.slice(4, 8));
  }
  return s;
}

/** Whether `account` (normalised or not) is one of `list` (normalised or not). */
export function accountListed(account: string, list: string[]): boolean {
  const a = normaliseBankAccount(account);
  if (!a) return false;
  return list.some((x) => normaliseBankAccount(x) === a);
}
