import { isoOrNull } from "../../../lib/db/serialize";
import { isUuid } from "../../../lib/uuid";
import type { SupplierFacts } from "../interfaces/interfaces";
import { customerRepository, type SupplierFactsRow } from "../repositories/customer.repository";

// What Finance → Accounts Payable (the invoicing service) marks a supplier's invoices by: no payment
// terms set, an unreliable VAT payer, an account not published or changed lately, a supplier still
// waiting for a manager, a low rating. The invoicing service decides what is a warning.

export const toSupplierFacts = (r: SupplierFactsRow): SupplierFacts => ({
  id: r.id,
  companyName: r.companyName,
  country: r.country,
  dic: r.dic,
  roles: r.roles,
  paymentDays: r.supplierPaymentDays,
  currency: r.supplierCurrency,
  vatUnreliable: r.supplierVatUnreliable,
  bankAccountPublished: r.supplierBankAccountPublished,
  vatCheckedAt: r.supplierVatCheckedAt,
  bankAccountsChangedAt: isoOrNull(r.supplierBankAccountsChangedAt),
  bankAccountsChangedByUserId: r.supplierBankAccountsChangedByUserId,
  approvalStatus: r.approvalStatus,
  rating: r.supplierRating,
});

class SupplierFactsService {
  /** The live companies of the company among `ids`; an unknown or deleted one is left out. */
  async factsOf(companyId: string, ids: string[]): Promise<SupplierFacts[]> {
    // Anything but an id matches nothing, as an unknown id does: Postgres would refuse it in a uuid column.
    const wanted = [...new Set(ids.filter(isUuid).map((id) => id.toLowerCase()))];
    if (!wanted.length) return [];
    return (await customerRepository.supplierFactsOf(companyId, wanted)).map(toSupplierFacts);
  }
}

export const supplierFactsService = new SupplierFactsService();
