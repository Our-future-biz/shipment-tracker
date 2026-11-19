import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db/db";
import { CANCELLED_STATUS } from "../lib/fieldDefaults";
import { INVOICED_STATUS } from "../lib/jobNumber";
import { shipmentTable } from "../schemas/shipment.schema";
import { directionMatch, handledByMatch, modeMatch } from "./shipment.repository";

// The jobs a manager hands over all at once (Council Outlay 11, D11; X9): a person's active jobs by
// Handled By - quiet ones too, not only those the cockpit's cards show - in the mode and direction the
// Team tab is in. The Handled By, mode and direction filters are the Shipments list's own
// (repositories/shipment.repository), so the list a Team row opens and the jobs it hands over are the same.

// An active job: live, not invoiced and not cancelled (the cockpit's own rule).
const ACTIVE = sql`${shipmentTable.deletedAt} IS NULL AND ${shipmentTable.invoicingStatus} IS DISTINCT FROM ${INVOICED_STATUS} AND ${shipmentTable.status} IS DISTINCT FROM ${CANCELLED_STATUS}`;

class HandOverJobsRepository {
  /**
   * The company's active jobs whose Handled By names `email` (lower case; never "nobody"), the
   * oldest first, at most `limit`, and how many there are in all. `mode` / `direction` as the list's
   * filters take them; "all" or nothing for every one.
   */
  async ofPerson(
    companyId: string,
    email: string,
    filter: { mode?: string; direction?: string },
    limit: number,
  ): Promise<{ jobs: { id: string; jobNumber: string; personInCharge: string; holidayCover: string }[]; total: number }> {
    const handledBy = handledByMatch(email);
    if (!handledBy) return { jobs: [], total: 0 };
    const where = and(eq(shipmentTable.companyId, companyId), ACTIVE, handledBy, modeMatch(filter.mode), directionMatch(filter.direction));
    const [jobs, [count]] = await Promise.all([
      db
        .select({ id: shipmentTable.id, jobNumber: shipmentTable.jobNumber, personInCharge: shipmentTable.personInCharge, holidayCover: shipmentTable.holidayCover })
        .from(shipmentTable)
        .where(where)
        .orderBy(asc(shipmentTable.createdAt), asc(shipmentTable.id))
        .limit(limit),
      db.select({ total: sql<number>`count(*)::int` }).from(shipmentTable).where(where),
    ]);
    return { jobs, total: count?.total ?? 0 };
  }
}

export const handOverJobsRepository = new HandOverJobsRepository();
