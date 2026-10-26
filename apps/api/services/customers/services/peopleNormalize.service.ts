import { companyUsers } from "../../../lib/companyUsers";
import type { CustomerPeopleNormalizeResult } from "../interfaces/interfaces";
import { planOwners, planValues } from "../lib/peopleNormalize";
import { customerRepository } from "../repositories/customer.repository";
import { customerNoteRepository } from "../repositories/customerNote.repository";

const total = (groups: { count: number }[]) => groups.reduce((sum, group) => sum + group.count, 0);

// Brings the people stored in the Customer Database to the users of the company, recorded by
// e-mail: the sales owner of each customer and the author of each Communication note. A
// superadmin starts it; it can be run again and again. Deleted rows are left as they were.
// Customer contact persons are not users and are not touched.
class CustomerPeopleService {
  async normalize(companyId: string): Promise<CustomerPeopleNormalizeResult> {
    // Without the users nothing can be decided: the run fails instead of guessing.
    const users = await companyUsers();
    const [owners, authors] = await Promise.all([customerRepository.salesOwnerGroups(companyId), customerNoteRepository.authorGroups(companyId)]);
    const ownerPlan = planOwners(owners, users);
    const authorPlan = planValues(authors, users);
    let changed = 0;
    // Each change rewrites only the rows that still hold what was read: an owner picked meanwhile stays.
    for (const change of ownerPlan.changes) changed += await customerRepository.setSalesOwnerWhere(companyId, change.from, change.to);
    for (const change of authorPlan.changes) changed += await customerNoteRepository.renameAuthor(companyId, change.from, change.to);
    return {
      checked: total(owners) + total(authors),
      changed,
      unmatched: [
        ...ownerPlan.unmatched.map((u) => ({ field: "salesOwner", ...u })),
        ...authorPlan.unmatched.map((u) => ({ field: "noteAuthor", ...u })),
      ].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    };
  }
}

export const customerPeopleService = new CustomerPeopleService();
