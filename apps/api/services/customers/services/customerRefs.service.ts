import { customerRepository } from "../repositories/customer.repository";
import { contactRepository } from "../repositories/contact.repository";
import type { CustomerContactRef, CustomerRef } from "../interfaces/interfaces";
import { isUuid } from "../../../lib/uuid";

class CustomerRefsService {
  /** Live customers of the company among `customerIds`, and their live contacts. */
  async refs(companyId: string, customerIds: string[]): Promise<{ customers: CustomerRef[]; contacts: CustomerContactRef[] }> {
    // Anything but an id matches nothing, as an unknown id does: Postgres would refuse it in a uuid column.
    const ids = [...new Set(customerIds.filter(isUuid).map((id) => id.toLowerCase()))];
    if (!ids.length) return { customers: [], contacts: [] };
    const [customers, contacts] = await Promise.all([
      customerRepository.refsByIds(companyId, ids),
      contactRepository.refsByCustomers(companyId, ids),
    ]);
    return { customers, contacts };
  }
}

export const customerRefsService = new CustomerRefsService();
