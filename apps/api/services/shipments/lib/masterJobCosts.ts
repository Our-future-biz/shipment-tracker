import log from "encore.dev/log";
import { invoicing } from "~encore/clients";

/**
 * Shares the costs of these master jobs out again over their shipments (invoicing), each once. A
 * failure doesn't undo what changed the shipments; it is logged, and the next change splits again.
 */
export async function resplitMasterJobCosts(masterJobIds: (string | null | undefined)[]): Promise<void> {
  for (const masterJobId of new Set(masterJobIds.filter((id): id is string => !!id))) {
    try {
      await invoicing._internalMasterJobResplit({ masterJobId });
    } catch (err) {
      log.error(err, "master job costs could not be split again", { masterJobId });
    }
  }
}
