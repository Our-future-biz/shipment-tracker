import { APIError } from "encore.dev/api";
import { trucking } from "~encore/clients";
import { customerRepository } from "../repositories/customer.repository";
import { isSupplier, type CustomerItem } from "../interfaces/interfaces";
import type { NewCustomerRecord } from "../schemas/customer.schema";
import { toCustomerItem } from "../lib/mappers";
import { dateInput } from "../lib/dates";
import { canManageSupplierTerms } from "../../../lib/salesPolicy";
import { bankAccountAdded, normaliseBankAccount } from "../../../lib/bankAccount";
import { userEmailOf } from "../../../lib/companyUsers";
import { customerService } from "./customer.service";

/** A supplier's terms and checks as a save sends them, every field. */
export interface SupplierTermsInput {
  paymentDays: number;
  currency: string;
  vatUnreliable: boolean;
  bankAccountPublished: boolean;
  /** yyyy-mm-dd, or "" when never checked */
  vatCheckedAt: string;
  bankAccounts: string[];
}

export interface TermsActor {
  userID: string;
  role: string;
}

/** The currencies Trucking pays a haulier in (its invoices are in these only). */
export const HAULIER_CURRENCIES = ["CZK", "EUR"] as const;

/** The input as stored: whole days 0–365, a currency code, a real date, every account a valid one, each once. */
export function cleanTerms(input: SupplierTermsInput): Omit<SupplierTermsInput, "vatCheckedAt"> & { vatCheckedAt: string | null } {
  if (!Number.isInteger(input.paymentDays) || input.paymentDays < 0 || input.paymentDays > 365) {
    throw APIError.invalidArgument("Payment days must be a whole number between 0 and 365");
  }
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw APIError.invalidArgument(`"${input.currency}" is not a currency code`);
  const accounts: string[] = [];
  for (const raw of input.bankAccounts) {
    const account = normaliseBankAccount(raw);
    if (!account) throw APIError.invalidArgument(`"${raw}" is neither a Czech bank account nor an IBAN`);
    if (!accounts.includes(account)) accounts.push(account);
  }
  return {
    paymentDays: input.paymentDays,
    currency,
    vatUnreliable: input.vatUnreliable,
    bankAccountPublished: input.bankAccountPublished,
    vatCheckedAt: dateInput(input.vatCheckedAt, "vatCheckedAt") ?? null,
    bankAccounts: accounts,
  };
}

// A supplier's payment terms and VAT / bank checks (Council Outlay 7, step 6b): edited here only, by a
// manager. A haulier's are copied to Trucking in the same save, before they are stored here, so a save
// Trucking cannot take is not kept either and the two never differ.
class SupplierTermsService {
  async set(companyId: string, customerId: string, actor: TermsActor, input: SupplierTermsInput): Promise<CustomerItem> {
    if (!canManageSupplierTerms(actor.role)) throw APIError.permissionDenied("Only a manager can change a supplier's payment terms and VAT / bank details");
    const terms = cleanTerms(input);
    const customer = await customerService.requireLive(customerId, companyId);
    if (!isSupplier(customer.roles)) throw APIError.invalidArgument("Only a supplier has supplier terms: give the company a role other than Customer first");
    const haulier = customer.roles.includes("haulier");
    if (haulier && !(HAULIER_CURRENCIES as readonly string[]).includes(terms.currency)) {
      throw APIError.invalidArgument("A haulier is paid in CZK or EUR: Trucking's haulier invoices are in those");
    }
    const by = await userEmailOf(actor.userID);
    // An added account starts Trucking's 30-day hold on its exact-match invoices; removing one changes nothing a payment could go to.
    const bankChange = bankAccountAdded(customer.supplierBankAccounts, terms.bankAccounts) ? { at: new Date(), byUserId: actor.userID || null, by } : null;
    if (haulier) {
      await trucking._internalHaulierTermsSet({
        customerId,
        terms: { ...terms, currency: terms.currency as (typeof HAULIER_CURRENCIES)[number] },
        bankAccountsChange: bankChange && { at: bankChange.at.toISOString(), byUserId: bankChange.byUserId, by: bankChange.by },
        byName: by,
      });
    }
    const values: Partial<NewCustomerRecord> = {
      supplierPaymentDays: terms.paymentDays,
      supplierCurrency: terms.currency,
      supplierVatUnreliable: terms.vatUnreliable,
      supplierBankAccountPublished: terms.bankAccountPublished,
      supplierVatCheckedAt: terms.vatCheckedAt,
      supplierBankAccounts: terms.bankAccounts,
      ...(bankChange ? { supplierBankAccountsChangedAt: bankChange.at, supplierBankAccountsChangedByUserId: bankChange.byUserId, supplierBankAccountsChangedBy: bankChange.by } : {}),
    };
    const row = await customerRepository.updateForCompany(customerId, companyId, values);
    if (!row) throw APIError.notFound("Customer not found");
    return toCustomerItem(row);
  }

  /**
   * The one-off copy of what Trucking holds for each haulier onto its company here (E2). Only onto a company
   * whose terms were never set here, so it can be run again and never overwrites a save made here.
   */
  async copyFromTrucking(companyId: string): Promise<{ copied: number; skipped: number }> {
    const { hauliers } = await trucking._internalHaulierTermsList();
    let copied = 0;
    let skipped = 0;
    for (const h of hauliers) {
      const customer = await customerRepository.getByIdForCompany(h.customerId, companyId);
      if (!customer || customer.supplierPaymentDays !== null) {
        skipped += 1;
        continue;
      }
      await customerRepository.updateForCompany(h.customerId, companyId, {
        supplierPaymentDays: h.paymentDays,
        supplierCurrency: h.currency,
        supplierVatUnreliable: h.vatUnreliable,
        supplierBankAccountPublished: h.bankAccountPublished,
        supplierVatCheckedAt: h.vatCheckedAt,
        supplierBankAccounts: h.bankAccounts,
        ...(h.bankAccountsChange
          ? { supplierBankAccountsChangedAt: new Date(h.bankAccountsChange.at), supplierBankAccountsChangedByUserId: h.bankAccountsChange.byUserId, supplierBankAccountsChangedBy: h.bankAccountsChange.by }
          : {}),
      });
      copied += 1;
    }
    return { copied, skipped };
  }
}

export const supplierTermsService = new SupplierTermsService();
