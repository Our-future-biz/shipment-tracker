import { APIError } from "encore.dev/api";
import { invoiceProfileRepository } from "../repositories/invoiceProfile.repository";
import { missingForIssue, normaliseProfile, validateProfile, type InvoiceProfileInput } from "../lib/invoiceProfile";
import type { InvoiceProfileItem } from "../interfaces/interfaces";

/** What a company that has not filled in its issuer details yet sees. */
const EMPTY: InvoiceProfileInput = normaliseProfile({
  companyName: "", street: "", city: "", postalCode: "", country: "CZ", ico: "", dic: "",
  vatPayer: true, registerEntry: "", email: "", phone: "", web: "", logoData: "",
  bankAccounts: [], defaultDueDays: 14, footerNote: "",
});

const toItem = (p: InvoiceProfileInput): InvoiceProfileItem => ({ ...p, missingForIssue: missingForIssue(p) });

class InvoiceProfileService {
  async get(companyId: string): Promise<InvoiceProfileItem> {
    const row = await invoiceProfileRepository.getByCompany(companyId);
    return toItem(row ? normaliseProfile(row) : EMPTY);
  }

  /** Saves the issuer details; IČO / DIČ / IBAN checks and the rest are in lib/invoiceProfile. */
  async save(companyId: string, input: InvoiceProfileInput): Promise<InvoiceProfileItem> {
    const profile = normaliseProfile(input);
    const errors = validateProfile(profile);
    if (errors.length) throw APIError.invalidArgument(errors.join("; "));
    return toItem(normaliseProfile(await invoiceProfileRepository.upsert(companyId, profile)));
  }
}

export const invoiceProfileService = new InvoiceProfileService();
