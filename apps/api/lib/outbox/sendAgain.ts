import { goneUsers, serviceActor } from "./serviceIdentity";
import type { ReplaceActors } from "./outboxRepository";

// "Send again" (a manager's action) for rows that failed for good: they go back to pending with a
// fresh count. A row written by a user who is no longer there (or by nobody) would only fail
// again, so it is sent as the company's service identity instead.

interface FailedRow {
  id: string;
  actingUserId: string;
}

interface Requeues<Row> {
  requeueFailed(companyId: string, ids: string[], replace: ReplaceActors | null): Promise<Row[]>;
}

/** Requeues `rows` (failed rows of the company); returns those requeued. */
export async function sendFailedAgain<Row>(repo: Requeues<Row>, companyId: string, rows: FailedRow[]): Promise<Row[]> {
  if (!rows.length) return [];
  const gone = await goneUsers(companyId, rows.map((r) => r.actingUserId));
  let replace: ReplaceActors | null = null;
  if (gone.length) {
    const as = await serviceActor(companyId);
    replace = { gone, userId: as.userID, role: as.role };
  }
  return repo.requeueFailed(companyId, rows.map((r) => r.id), replace);
}
