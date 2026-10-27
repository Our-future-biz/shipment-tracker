import { companyUsers } from "../../../lib/companyUsers";
import type { QuotePeopleNormalizeResult } from "../interfaces/interfaces";
import { salesQuoteRepository } from "../repositories/salesQuote.repository";
import { ownerLabelOf } from "../utils/quoteLifecycle.utils";
import { ownerBackfillService } from "./ownerBackfill.service";

// A person picked anywhere is a user of the company, recorded by e-mail (owner decision,
// 26 Oct 2026). Quotes from before name their owner by the owner user's display name, or by a
// name typed before owners were users. This run - a superadmin starts it, it can be run again and
// again - brings the company's quotes there. Deleted quotes are left as they were.
class QuotePeopleService {
  async normalize(companyId: string): Promise<QuotePeopleNormalizeResult> {
    // Quotes older code left without columns get them first: the owner is read from the columns.
    await salesQuoteRepository.adoptPending(companyId);
    // Without the users nothing can be decided: the run fails instead of guessing.
    const users = await companyUsers();
    // Owner texts nobody compared with the users yet are matched by the backfill's own rule. One
    // compared before is not matched again: somebody who joined later under the same name never
    // inherits old quotes (ownerBackfill.service).
    const changed = new Set(await ownerBackfillService.matchOwnersWith(companyId, users));
    // Every quote of a user: the label and its mirror in the document become the user's e-mail. A
    // user who is no longer in the company keeps the label the quote has.
    for (const user of users) {
      const label = ownerLabelOf(user.email);
      if (!label) continue;
      for (const id of await salesQuoteRepository.relabelOwner(companyId, user.id, label)) changed.add(id);
    }
    const owners = await salesQuoteRepository.ownerCounts(companyId);
    return {
      checked: owners.reduce((sum, owner) => sum + owner.count, 0),
      changed: changed.size,
      unmatched: owners
        .filter((owner) => owner.ownerUserId === null)
        .map((owner) => ({ field: "owner", value: owner.ownerLabel, count: owner.count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    };
  }
}

export const quotePeopleService = new QuotePeopleService();
