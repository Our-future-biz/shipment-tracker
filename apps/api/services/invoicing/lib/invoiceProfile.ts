import type { BankAccount } from "../schemas/invoiceProfile.schema";

/**
 * Validation of the issuer details printed on invoices. Pure functions, so they are
 * unit-tested without a database. Each check returns an error message or null.
 */

export interface InvoiceProfileInput {
  companyName: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  ico: string;
  dic: string;
  vatPayer: boolean;
  registerEntry: string;
  email: string;
  phone: string;
  web: string;
  logoData: string;
  bankAccounts: BankAccount[];
  defaultDueDays: number;
  footerNote: string;
}

/** Logo stored in the database as a data URL - keep it small. */
export const MAX_LOGO_CHARS = 400_000;

/** Czech IČO: 8 digits, the last one is a mod-11 check digit. */
export function icoError(ico: string): string | null {
  if (!/^\d{8}$/.test(ico)) return "IČO must have 8 digits";
  const digits = ico.split("").map(Number);
  const sum = digits.slice(0, 7).reduce((s, d, i) => s + d * (8 - i), 0);
  const check = (11 - (sum % 11)) % 10;
  return check === digits[7] ? null : "IČO check digit does not match";
}

/** DIČ: country prefix + number, e.g. CZ12345678; Czech ones have 8-10 digits. */
export function dicError(dic: string): string | null {
  if (dic.startsWith("CZ")) return /^CZ\d{8,10}$/.test(dic) ? null : "Czech DIČ is CZ followed by 8-10 digits";
  return /^[A-Z]{2}[0-9A-Z]{2,13}$/.test(dic) ? null : "DIČ must start with a 2-letter country code";
}

/** IBAN: country code, check digits, mod-97 check (ISO 13616). */
export function ibanError(iban: string): string | null {
  const s = iban.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return "IBAN format is not valid";
  const rearranged = s.slice(4) + s.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const ch of numeric) rest = (rest * 10 + Number(ch)) % 97;
  return rest === 1 ? null : "IBAN check digits do not match";
}

export function swiftError(swift: string): string | null {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(swift) ? null : "SWIFT/BIC must have 8 or 11 characters";
}

/** Trims every text field and normalises codes, so stored values are clean. */
export function normaliseProfile(input: InvoiceProfileInput): InvoiceProfileInput {
  const t = (v: string) => (v ?? "").trim();
  return {
    companyName: t(input.companyName),
    street: t(input.street),
    city: t(input.city),
    postalCode: t(input.postalCode),
    country: t(input.country).toUpperCase() || "CZ",
    ico: t(input.ico).replace(/\s/g, ""),
    dic: t(input.dic).replace(/\s/g, "").toUpperCase(),
    vatPayer: !!input.vatPayer,
    registerEntry: t(input.registerEntry),
    email: t(input.email),
    phone: t(input.phone),
    web: t(input.web),
    logoData: t(input.logoData),
    bankAccounts: (input.bankAccounts ?? []).map((a) => ({
      currency: t(a.currency).toUpperCase(),
      bankName: t(a.bankName),
      accountNumber: t(a.accountNumber),
      iban: t(a.iban).replace(/\s/g, "").toUpperCase(),
      swift: t(a.swift).replace(/\s/g, "").toUpperCase(),
    })),
    defaultDueDays: Math.trunc(Number(input.defaultDueDays)),
    footerNote: t(input.footerNote),
  };
}

/** All problems with a (normalised) profile; an empty list means it can be saved. */
export function validateProfile(p: InvoiceProfileInput): string[] {
  const errors: string[] = [];
  if (p.ico) {
    const e = icoError(p.ico);
    if (e) errors.push(e);
  }
  if (p.dic) {
    const e = dicError(p.dic);
    if (e) errors.push(e);
  }
  if (p.vatPayer && p.companyName && !p.dic) errors.push("A VAT payer needs a DIČ");
  if (!Number.isInteger(p.defaultDueDays) || p.defaultDueDays < 0 || p.defaultDueDays > 365) {
    errors.push("Default due days must be a whole number between 0 and 365");
  }
  if (p.logoData && !/^data:image\/(png|jpeg);base64,/.test(p.logoData)) errors.push("Logo must be a PNG or JPEG image");
  if (p.logoData.length > MAX_LOGO_CHARS) errors.push("Logo is too large (max. about 300 KB)");

  const seen = new Set<string>();
  p.bankAccounts.forEach((a, i) => {
    const row = `Bank account ${i + 1}`;
    if (!/^[A-Z]{3}$/.test(a.currency)) errors.push(`${row}: currency must be a 3-letter code`);
    else if (seen.has(a.currency)) errors.push(`${row}: there is already an account for ${a.currency}`);
    seen.add(a.currency);
    if (!a.iban && !a.accountNumber) errors.push(`${row}: fill in the IBAN or the account number`);
    if (a.iban) {
      const e = ibanError(a.iban);
      if (e) errors.push(`${row}: ${e}`);
    }
    if (a.swift) {
      const e = swiftError(a.swift);
      if (e) errors.push(`${row}: ${e}`);
    }
  });
  return errors;
}

/**
 * What is still missing before an invoice can be issued. A profile can be saved half
 * filled in, but issuing needs these.
 */
export function missingForIssue(p: InvoiceProfileInput): string[] {
  const missing: string[] = [];
  if (!p.companyName) missing.push("company name");
  if (!p.street || !p.city || !p.postalCode) missing.push("address");
  if (!p.ico) missing.push("IČO");
  if (p.vatPayer && !p.dic) missing.push("DIČ");
  if (p.bankAccounts.length === 0) missing.push("bank account");
  return missing;
}
