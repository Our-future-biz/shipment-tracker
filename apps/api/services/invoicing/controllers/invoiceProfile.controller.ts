import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { invoiceProfileRepository } from "../repositories/invoiceProfile.repository";
import { missingForIssue, normaliseProfile, validateProfile, type InvoiceProfileInput } from "../lib/invoiceProfile";
import type { InvoiceProfileItem } from "../interfaces/interfaces";

/**
 * Issuer details printed on invoices (Settings → Organization → Invoicing details).
 * Everyone can read them (the Invoice panel shows what is missing); only admins edit.
 */

const EMPTY: InvoiceProfileInput = normaliseProfile({
  companyName: "", street: "", city: "", postalCode: "", country: "CZ", ico: "", dic: "",
  vatPayer: true, registerEntry: "", email: "", phone: "", web: "", logoData: "",
  bankAccounts: [], defaultDueDays: 14, footerNote: "",
});

const toItem = (p: InvoiceProfileInput): InvoiceProfileItem => ({ ...p, missingForIssue: missingForIssue(p) });

interface GetProfileResponse {
  profile: InvoiceProfileItem;
}

export const invoiceProfileGet = api(
  { expose: true, auth: true, method: "GET", path: "/invoicing/profile" },
  async (): Promise<GetProfileResponse> => {
    const row = await invoiceProfileRepository.getByCompany(getAuthData()!.companyID);
    return { profile: toItem(row ? normaliseProfile(row) : EMPTY) };
  },
);

type SaveProfileRequest = InvoiceProfileInput;

export const invoiceProfileSave = api(
  { expose: true, auth: true, method: "PUT", path: "/invoicing/profile" },
  async (req: SaveProfileRequest): Promise<GetProfileResponse> => {
    const actor = requireRole("superadmin", "admin");
    const profile = normaliseProfile(req);
    const errors = validateProfile(profile);
    if (errors.length) throw APIError.invalidArgument(errors.join("; "));
    const row = await invoiceProfileRepository.upsert(actor.companyID, profile);
    return { profile: toItem(normaliseProfile(row)) };
  },
);
