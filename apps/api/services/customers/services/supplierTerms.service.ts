import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { trucking } from "~encore/clients";
import { customerRepository } from "../repositories/customer.repository";
import { isSupplier, type CustomerItem, type CustomerRole, type SupplierTerms } from "../interfaces/interfaces";
import type { CustomerRecord, NewCustomerRecord } from "../schemas/customer.schema";
import { toCustomerItem } from "../lib/mappers";
import { dateInput } from "../lib/dates";
import { canManageSupplierTerms } from "../../../lib/salesPolicy";
import { bankAccountAdded, normaliseBankAccount } from "../../../lib/bankAccount";
import { businessDay } from "../../../lib/businessDate";
import { userEmailOf } from "../../../lib/companyUsers";

/** A supplier's terms and checks as a save sends them, every field. */
export interface SupplierTermsInput {
  /** null while nobody has set them (a haulier needs them: Trucking pays by them) */
  paymentDays: number | null;
  /** an ISO code, or "" while not set (a haulier's is CZK or EUR) */
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

interface CleanTerms {
  paymentDays: number | null;
  currency: string | null;
  vatUnreliable: boolean;
  bankAccountPublished: boolean;
  vatCheckedAt: string | null;
  bankAccounts: string[];
}

/** Trucking's copy of a haulier's terms, with when and by whom an account was last added there. */
type TruckingTerms = NonNullable<Awaited<ReturnType<typeof trucking._internalHaulierTermsGet>>["haulier"]>;

/** The currencies Trucking pays a haulier in (its invoices are in these only). */
export const HAULIER_CURRENCIES = ["CZK", "EUR"] as const;

/**
 * The input as stored: whole days 0–365 or none, a currency code or none, a real day not after today
 * (`today`, yyyy-mm-dd: a check in the future would silence the "check due" warnings), every account a
 * valid one, each once.
 */
export function cleanTerms(input: SupplierTermsInput, today: string): CleanTerms {
  if (input.paymentDays !== null && (!Number.isInteger(input.paymentDays) || input.paymentDays < 0 || input.paymentDays > 365)) {
    throw APIError.invalidArgument("Payment days must be a whole number between 0 and 365");
  }
  const currency = input.currency.trim().toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency)) throw APIError.invalidArgument(`"${input.currency}" is not a currency code`);
  const vatCheckedAt = dateInput(input.vatCheckedAt, "vatCheckedAt") ?? null;
  if (vatCheckedAt && vatCheckedAt > today) throw APIError.invalidArgument("The VAT register check cannot be after today");
  const accounts: string[] = [];
  for (const raw of input.bankAccounts) {
    const account = normaliseBankAccount(raw);
    if (!account) throw APIError.invalidArgument(`"${raw}" is neither a Czech bank account nor an IBAN`);
    if (!accounts.includes(account)) accounts.push(account);
  }
  return {
    paymentDays: input.paymentDays,
    currency: currency || null,
    vatUnreliable: input.vatUnreliable,
    bankAccountPublished: input.bankAccountPublished,
    vatCheckedAt,
    bankAccounts: accounts,
  };
}

/** A haulier's terms reach Trucking whole: Trucking pays by its days and in CZK or EUR. */
function haulierTerms(terms: CleanTerms) {
  if (terms.paymentDays === null) throw APIError.invalidArgument("A haulier needs its payment days: Trucking pays its invoices by them");
  if (!terms.currency || !(HAULIER_CURRENCIES as readonly string[]).includes(terms.currency)) {
    throw APIError.invalidArgument("A haulier is paid in CZK or EUR: Trucking's haulier invoices are in those");
  }
  return { ...terms, paymentDays: terms.paymentDays, currency: terms.currency as (typeof HAULIER_CURRENCIES)[number] };
}

const termsOfRow = (r: CustomerRecord): CleanTerms => ({
  paymentDays: r.supplierPaymentDays,
  currency: r.supplierCurrency,
  vatUnreliable: r.supplierVatUnreliable,
  bankAccountPublished: r.supplierBankAccountPublished,
  vatCheckedAt: r.supplierVatCheckedAt,
  bankAccounts: r.supplierBankAccounts,
});

/** Terms never saved here: a haulier's are then still Trucking's alone (until the one-off copy, E2). */
const unsetHere = (r: { supplierPaymentDays: number | null }) => r.supplierPaymentDays === null;

/** The values of Trucking's copy as stored here. */
const fromTruckingValues = (h: TruckingTerms): Partial<NewCustomerRecord> => ({
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

async function truckingTermsOf(customerId: string): Promise<TruckingTerms | null> {
  return (await trucking._internalHaulierTermsGet({ customerId })).haulier;
}

// A supplier's payment terms and VAT / bank checks (Council Outlay 7, step 6b): edited here only, by a
// manager. A haulier's are copied to Trucking in the same save, before they are stored here, so a save
// Trucking cannot take is not kept either. Saves of one company run one after the other (its row is
// locked), so Trucking gets them in the order they are stored here.
class SupplierTermsService {
  async set(companyId: string, customerId: string, actor: TermsActor, input: SupplierTermsInput): Promise<CustomerItem> {
    if (!canManageSupplierTerms(actor.role)) throw APIError.permissionDenied("Only a manager can change a supplier's payment terms and VAT / bank details");
    const terms = cleanTerms(input, businessDay(new Date()));
    const by = await userEmailOf(actor.userID);
    const row = await customerRepository.updateLocked(customerId, companyId, async (customer) => {
      if (!isSupplier(customer.roles)) throw APIError.invalidArgument("Only a supplier has supplier terms: give the company a role other than Customer first");
      const haulier = customer.roles.includes("haulier");
      const sent = haulier ? haulierTerms(terms) : null;
      // A haulier's first save here starts from what Trucking holds (K1): an account Trucking already lists is
      // not new, and when it was added there stays known.
      const truckingCopy = haulier && unsetHere(customer) ? await truckingTermsOf(customerId) : null;
      const before = truckingCopy ? truckingCopy.bankAccounts : customer.supplierBankAccounts;
      // An added account starts Trucking's 30-day hold on its exact-match invoices; removing one changes nothing a payment could go to.
      const bankChange = bankAccountAdded(before, terms.bankAccounts) ? { at: new Date(), byUserId: actor.userID || null, by } : null;
      if (sent) {
        await trucking._internalHaulierTermsSet({
          customerId,
          terms: sent,
          bankAccountsChange: bankChange && { at: bankChange.at.toISOString(), byUserId: bankChange.byUserId, by: bankChange.by },
          byName: by,
        });
      }
      return {
        ...(truckingCopy ? fromTruckingValues(truckingCopy) : {}),
        supplierPaymentDays: terms.paymentDays,
        supplierCurrency: terms.currency,
        supplierVatUnreliable: terms.vatUnreliable,
        supplierBankAccountPublished: terms.bankAccountPublished,
        supplierVatCheckedAt: terms.vatCheckedAt,
        supplierBankAccounts: terms.bankAccounts,
        ...(bankChange ? { supplierBankAccountsChangedAt: bankChange.at, supplierBankAccountsChangedByUserId: bankChange.byUserId, supplierBankAccountsChangedBy: bankChange.by } : {}),
      };
    });
    if (!row) throw APIError.notFound("Customer not found");
    return toCustomerItem(row);
  }

  /**
   * A haulier's terms as its page shows them: while none were saved here, Trucking's copy (fromTrucking),
   * so the page and its editor start from the real values, not from empty ones (K1). Trucking out of reach
   * leaves them as stored here.
   */
  async shown(customer: CustomerItem): Promise<{ terms: SupplierTerms; fromTrucking: boolean }> {
    if (!customer.roles.includes("haulier") || customer.supplierTerms.paymentDays !== null) return { terms: customer.supplierTerms, fromTrucking: false };
    try {
      const h = await truckingTermsOf(customer.id);
      if (!h) return { terms: customer.supplierTerms, fromTrucking: false };
      return {
        fromTrucking: true,
        terms: {
          paymentDays: h.paymentDays,
          currency: h.currency,
          vatUnreliable: h.vatUnreliable,
          bankAccountPublished: h.bankAccountPublished,
          vatCheckedAt: h.vatCheckedAt ?? "",
          bankAccounts: h.bankAccounts,
          bankAccountsChangedAt: h.bankAccountsChange?.at ?? null,
          bankAccountsChangedBy: h.bankAccountsChange?.by ?? "",
        },
      };
    } catch (err) {
      log.warn(err, "Trucking's copy of a haulier's terms could not be read; the page shows the Customer Database's", { customerId: customer.id });
      return { terms: customer.supplierTerms, fromTrucking: false };
    }
  }

  /**
   * When a change of roles makes a supplier whose terms are set here a haulier, Trucking gets them before
   * the roles are stored (K3), every account on Trucking's 30-day hold (none of them was checked there).
   * Gives the values to store with the roles: the hold's stamp. Nothing to do otherwise.
   */
  async beforeRolesChange(current: CustomerRecord, roles: CustomerRole[], actorUserId: string): Promise<Partial<NewCustomerRecord>> {
    if (current.roles.includes("haulier") || !roles.includes("haulier") || unsetHere(current)) return {};
    let sent;
    try {
      sent = haulierTerms(termsOfRow(current));
    } catch (err) {
      if (err instanceof APIError) throw APIError.invalidArgument(`${err.message}. Set them in Finance → Terms and checks first, then add the Haulier role`);
      throw err;
    }
    const by = await userEmailOf(actorUserId);
    const bankChange = current.supplierBankAccounts.length ? { at: new Date(), byUserId: actorUserId || null, by } : null;
    await trucking._internalHaulierTermsSet({
      customerId: current.id,
      terms: sent,
      bankAccountsChange: bankChange && { at: bankChange.at.toISOString(), byUserId: bankChange.byUserId, by: bankChange.by },
      byName: by,
    });
    return bankChange ? { supplierBankAccountsChangedAt: bankChange.at, supplierBankAccountsChangedByUserId: bankChange.byUserId, supplierBankAccountsChangedBy: bankChange.by } : {};
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
      if (!customer || !unsetHere(customer)) {
        skipped += 1;
        continue;
      }
      await customerRepository.updateForCompany(h.customerId, companyId, fromTruckingValues(h));
      copied += 1;
    }
    return { copied, skipped };
  }
}

export const supplierTermsService = new SupplierTermsService();
