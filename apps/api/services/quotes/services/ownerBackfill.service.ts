import log from "encore.dev/log";
import { auth } from "~encore/clients";
import { salesQuoteRepository } from "../repositories/salesQuote.repository";
import { matchOwnerLabel } from "../utils/ownerMatch.utils";

// How long this process takes it that a company has no owner text left to examine without
// looking. Quotes it adopts itself end that at once; what it cannot see - quotes adopted by
// another instance or by a repair run by hand - is found when the time is up, not only by the
// next process.
const LOOK_AGAIN_AFTER_MS = 5 * 60 * 1000;

// The owner of an old quote is a typed name. Each such text is compared with the company's users
// ONCE: the quotes that carry it get the user it names, or nobody, and are stamped as examined
// either way - so somebody who joins later under the same name never inherits old quotes. Users
// live in the auth service, which is why this is code and not a migration. Nothing but the owner
// user and the stamp is written: a page that has such a quote open keeps saving.
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
        ({ users } = await auth.usersList());
      } catch (err) {
        // Without the users nothing can be decided, and nothing is stamped or remembered: the next read tries again.
        log.warn(err, "owner texts of quotes were not matched: the users could not be read", { companyId });
        this.examined.delete(companyId);
        return;
      }
      for (const label of labels) {
        await salesQuoteRepository.recordOwnerMatch(companyId, label, matchOwnerLabel(label, users));
      }
    }
    this.examined.set(companyId, seen);
  }
}

export const ownerBackfillService = new OwnerBackfillService();
