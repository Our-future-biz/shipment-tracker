import log from "encore.dev/log";
import { companyUsers, type CompanyUser } from "../../../lib/companyUsers";
import { salesQuoteRepository } from "../repositories/salesQuote.repository";
import { matchOwnerLabel } from "../utils/ownerMatch.utils";
import { ownerLabelOf } from "../utils/quoteLifecycle.utils";

// How long this process takes it that a company has no owner text left to examine without
// looking. Quotes it adopts itself end that at once; what it cannot see - quotes adopted by
// another instance or by a repair run by hand - is found when the time is up, not only by the
// next process.
const LOOK_AGAIN_AFTER_MS = 5 * 60 * 1000;

// The owner of an old quote is a typed name. Each such text is compared with the company's users
// ONCE: the quotes that carry it get the user it names, or nobody, and are stamped as examined
// either way - so somebody who joins later under the same name never inherits old quotes. A quote
// that gets a user is then owned under that user's e-mail, as every person is recorded. Users
// live in the auth service, which is why this is code and not a migration. Nothing but the owner
// and the stamp is written: a page that has such a quote open keeps saving.
class OwnerBackfillService {
  // Per company: when this process last found nothing left to examine, and how many adoptions it
  // had made by then. Asking on each read would scan every quote of the company every time.
  private readonly examined = new Map<string, { at: number; adoptions: number }>();

  /** What a read of the company's quotes starts with: the owner texts are matched, unless this process knows that none is waiting. */
  async ensureOwnersMatched(companyId: string): Promise<void> {
    const known = this.examined.get(companyId);
    if (known && known.adoptions === salesQuoteRepository.adoptions(companyId) && Date.now() - known.at < LOOK_AGAIN_AFTER_MS) return;
    await this.matchOwners(companyId);
  }

  /** Matches the owner texts that wait for it, whatever this process remembers - for a caller that holds a quote with such a text. */
  async matchOwners(companyId: string): Promise<void> {
    // Noted before the texts are read: a quote adopted while this runs makes the next read look again.
    const seen = { at: Date.now(), adoptions: salesQuoteRepository.adoptions(companyId) };
    const labels = await salesQuoteRepository.unexaminedOwnerLabels(companyId);
    if (labels.length) {
      let users;
      try {
        users = await companyUsers();
      } catch (err) {
        // Without the users nothing can be decided, and nothing is stamped or remembered: the next read tries again.
        log.warn(err, "owner texts of quotes were not matched: the users could not be read", { companyId });
        this.examined.delete(companyId);
        return;
      }
      await this.record(companyId, labels, users);
    }
    this.examined.set(companyId, seen);
  }

  /**
   * The same, with the users the caller has already read (the people normalize run): the ids of
   * the quotes that got an owner user.
   */
  async matchOwnersWith(companyId: string, users: CompanyUser[]): Promise<string[]> {
    const seen = { at: Date.now(), adoptions: salesQuoteRepository.adoptions(companyId) };
    const linked = await this.record(companyId, await salesQuoteRepository.unexaminedOwnerLabels(companyId), users);
    this.examined.set(companyId, seen);
    return linked;
  }

  // Each text gets the user it names, owning the quotes under that user's e-mail, or nobody. The
  // ids of the quotes that got a user.
  private async record(companyId: string, labels: string[], users: CompanyUser[]): Promise<string[]> {
    const linked: string[] = [];
    for (const label of labels) {
      const userId = matchOwnerLabel(label, users);
      const user = userId ? users.find((u) => u.id === userId) : undefined;
      const owner = user ? { userId: user.id, label: ownerLabelOf(user.email) } : null;
      linked.push(...(await salesQuoteRepository.recordOwnerMatch(companyId, label, owner)));
    }
    return linked;
  }
}

export const ownerBackfillService = new OwnerBackfillService();
