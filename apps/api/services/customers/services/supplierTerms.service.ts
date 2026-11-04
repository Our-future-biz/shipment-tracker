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
import { isUuid } from "../../../lib/uuid";

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
  /** The editor started from Trucking's copy (supplierTermsFromTrucking was true when the page read them). */
  fromTrucking?: boolean;
}

export interface TermsActor {
  userID: string;
  role: string;
}

/** A haulier's terms as its page shows them, and where from. */
export interface ShownTerms {
  terms: SupplierTerms;
  /** Never saved here: these are Trucking's copy. */
  fromTrucking: boolean;
  /** Never saved here, and Trucking's copy could not be read: they must not be edited until it can. */
  truckingUnavailable: boolean;
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

/**
 * Nothing of the terms set: each one still as a new company has it. Not the payment days alone - a supplier
 * that is no haulier may keep its VAT checks and accounts without them (K7).
 */
const nothingSet = (t: Pick<CleanTerms, "paymentDays" | "vatUnreliable" | "bankAccountPublished" | "bankAccounts"> & { currency: string | null; vatCheckedAt: string | null }) =>
  t.paymentDays === null && !t.currency && !t.vatUnreliable && !t.bankAccountPublished && !t.vatCheckedAt && t.bankAccounts.length === 0;

/** Terms never saved here: a haulier's are then still Trucking's alone (until the one-off copy, E2). */
const unsetHere = (r: CustomerRecord) => nothingSet(termsOfRow(r));

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

/** The values to store with a role change that adds or keeps an account's hold stamp. */
const stampValues = (bankChange: { at: Date; byUserId: string | null; by: string } | null): Partial<NewCustomerRecord> =>
  bankChange ? { supplierBankAccountsChangedAt: bankChange.at, supplierBankAccountsChangedByUserId: bankChange.byUserId, supplierBankAccountsChangedBy: bankChange.by } : {};

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
      // An editor that started from empty terms while Trucking held some (it could not be read then) would
      // wipe Trucking's VAT and bank details with this save.
      if (truckingCopy && !input.fromTrucking) {
        throw APIError.failedPrecondition("Trucking holds this haulier's terms, which the page did not show when it was opened: reload it and edit them from there");
      }
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
        ...stampValues(bankChange),
      };
    });
    if (!row) throw APIError.notFound("Customer not found");
    return toCustomerItem(row);
  }

  /**
   * A haulier's terms as its page shows them: while none were saved here, Trucking's copy (fromTrucking),
   * so the page and its editor start from the real values, not from empty ones (K1). Trucking out of reach
   * leaves them as stored here, said so (truckingUnavailable): an edit from those could wipe Trucking's.
   */
  async shown(customer: CustomerItem): Promise<ShownTerms> {
    const here = { terms: customer.supplierTerms, fromTrucking: false, truckingUnavailable: false };
    if (!customer.roles.includes("haulier") || !nothingSet(customer.supplierTerms)) return here;
    try {
      const h = await truckingTermsOf(customer.id);
      if (!h) return here;
      return {
        fromTrucking: true,
        truckingUnavailable: false,
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
      return { ...here, truckingUnavailable: true };
    }
  }

  /**
   * When a change of roles makes a supplier whose terms are set here a haulier, Trucking gets them before
   * the roles are stored (K3), every account on Trucking's 30-day hold (none of them was checked there);
   * terms set here but not enough for a haulier refuse the change. Gives the values to store with the roles:
   * the hold's stamp. Nothing to do otherwise. Called with the company's row locked (customerService.update),
   * so it runs one after the other with a save of the terms.
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
    return stampValues(bankChange);
  }

  /**
   * The one-off copy of what Trucking holds for each haulier of `companyId` onto its company here (E2), run by
   * a superadmin for that company (superadmins belong to the platform company, not to it). Only onto a live haulier whose terms were never set here, checked
   * with its row locked, so it can be run again and never overwrites a save made here, even one made meanwhile.
   */
  async copyFromTrucking(companyId: string): Promise<{ copied: number; skipped: number }> {
    if (!isUuid(companyId)) throw APIError.invalidArgument("companyId must be the id of a company");
    const { hauliers } = await trucking._internalHaulierTermsList({ companyId });
    let copied = 0;
    for (const h of hauliers) {
      let copy = false;
      await customerRepository.updateLocked(h.customerId, companyId, async (customer) => {
        copy = customer.roles.includes("haulier") && unsetHere(customer);
        return copy ? fromTruckingValues(h) : null;
      });
      if (copy) copied += 1;
    }
    return { copied, skipped: hauliers.length - copied };
  }
}

export const supplierTermsService = new SupplierTermsService();
