import { isUuid } from "../../../lib/uuid";
import { isCustomerLanguage, type CustomerReceivableFacts } from "../interfaces/interfaces";
import { reminderContact } from "../lib/receivable";
import { customerRepository } from "../repositories/customer.repository";

// What Finance → Accounts Receivable (the invoicing service) shows of the customers its invoices are billed to: the
// name, the Sales Owner, the terms and credit limit, the language it is written to in, and whom a payment reminder
// goes to (lib/receivable reminderContact). A deleted customer is included and says so: an issued invoice still names it.
class ReceivableFactsService {
  /** The company's customers among `ids`; an unknown one is left out. */
  async factsOf(companyId: string, ids: string[]): Promise<CustomerReceivableFacts[]> {
    // Anything but an id matches nothing, as an unknown id does: Postgres would refuse it in a uuid column.
    const wanted = [...new Set(ids.filter(isUuid).map((id) => id.toLowerCase()))];
    if (!wanted.length) return [];
    const [customers, contacts] = await Promise.all([
      customerRepository.receivableFactsOf(companyId, wanted),
      customerRepository.reminderContactsOf(companyId, wanted),
    ]);
    return customers.map((c) => ({
      id: c.id,
      companyName: c.companyName,
      salesOwner: c.salesOwner,
      salesOwnerUserId: c.salesOwnerUserId,
      paymentTerms: c.paymentTerms,
      creditLimit: c.creditLimit,
      currency: c.currency,
      reminderTo: reminderContact(contacts.filter((k) => k.customerId === c.id)),
      // A value the database would refuse never reaches it; anything else is written in English.
      language: isCustomerLanguage(c.language) ? c.language : "en",
      deleted: c.deletedAt !== null,
    }));
  }
}

export const receivableFactsService = new ReceivableFactsService();
