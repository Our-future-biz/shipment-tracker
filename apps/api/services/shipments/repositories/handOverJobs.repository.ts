import { and, asc, eq, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "../db/db";
import { CANCELLED_STATUS } from "../lib/fieldDefaults";
import type { HandOverTarget } from "../lib/handOver";
import { INVOICED_STATUS } from "../lib/jobNumber";
import { shipmentTable } from "../schemas/shipment.schema";
import { directionMatch, handledByMatch, modeMatch } from "./shipment.repository";

// The jobs a manager hands over all at once (Council Outlay 11, D11; X9): a person's active jobs by
// Handled By - or the jobs they cover as Holiday Cover (P12) - quiet ones too, not only those the cockpit's
// cards show, in the mode and direction the Team tab is in. The Handled By, mode and direction filters are
// the Shipments list's own (repositories/shipment.repository), so the list a Team row opens and the jobs it
// hands over are the same.

// An active job: live, not invoiced and not cancelled (the cockpit's own rule).
const ACTIVE = sql`${shipmentTable.deletedAt} IS NULL AND ${shipmentTable.invoicingStatus} IS DISTINCT FROM ${INVOICED_STATUS} AND ${shipmentTable.status} IS DISTINCT FROM ${CANCELLED_STATUS}`;

// Who a person field names: the e-mail before the name an old value may carry after it, trimmed and lower
// case - lib/shipmentEditRule personEmail in SQL, as repositories/shipment.repository has it.
const TRIMMED_WHITESPACE = " \t\n\r ";
const personEmailOf = (column: PgColumn): SQL => sql`lower(btrim(split_part(${column}, ' — ', 1), ${TRIMMED_WHITESPACE}))`;

/** Whose jobs: those naming the person in Handled By, or as Holiday Cover ("Replace as Holiday Cover…", P12). */
export type HandOverWho = { handledBy: string } | { holidayCover: string };

/**
 * The jobs a hand-over to `target` would change (n25): lib/handOver handOverChange in SQL - a field the
 * target names that the job holds otherwise, by e-mail. Undefined when there is no target: every job is listed.
 */
export function wouldChange(target: HandOverTarget | null): SQL | undefined {
  if (!target) return undefined;
  const parts: SQL[] = [];
  if (target.handledBy !== null) parts.push(sql`${personEmailOf(shipmentTable.personInCharge)} <> ${target.handledBy.trim().toLowerCase()}`);
  if (target.holidayCover !== null) parts.push(sql`${personEmailOf(shipmentTable.holidayCover)} <> ${target.holidayCover.trim().toLowerCase()}`);
  return parts.length ? or(...parts) : undefined;
}

class HandOverJobsRepository {
  /**
   * The company's active jobs whose Handled By - or Holiday Cover - names the person (`who`, any case; never
   * "nobody"), the oldest first, at most `limit`, and how many there are in all. `mode` / `direction` as the
   * list's filters take them; "all" or nothing for every one. With a `target`, only the jobs a hand-over to
   * it would change - so the 201st job is reached once the first 200 are already so (n25).
   */
  async ofPerson(
    companyId: string,
    who: HandOverWho,
    filter: { mode?: string; direction?: string },
    limit: number,
    target: HandOverTarget | null = null,
  ): Promise<{ jobs: { id: string; jobNumber: string; personInCharge: string; holidayCover: string }[]; total: number }> {
    const cover = "holidayCover" in who ? who.holidayCover.trim().toLowerCase() : "";
    const person = "handledBy" in who ? handledByMatch(who.handledBy) : cover ? sql`${personEmailOf(shipmentTable.holidayCover)} = ${cover}` : undefined;
    if (!person) return { jobs: [], total: 0 };
    const where = and(eq(shipmentTable.companyId, companyId), ACTIVE, person, modeMatch(filter.mode), directionMatch(filter.direction), wouldChange(target));
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
