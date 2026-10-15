import { and, desc, eq, or, type SQL } from "drizzle-orm";
import { db, type Tx } from "../db/db";
import { truckingEventTable, type NewTruckingEventRecord } from "../schemas/truckingEvent.schema";

/** An event to append, without the company (the repository that writes it adds it). */
export type TruckingEventInput = Omit<NewTruckingEventRecord, "companyId" | "id" | "at">;

const e = truckingEventTable;
const MAX_EVENTS = 200;

// trucking_event is append-only (a trigger refuses UPDATE and DELETE). Events are written in the
// same transaction as the change they describe, so there is never a change without its event.
export async function appendEvent(tx: Tx | typeof db, companyId: string, event: TruckingEventInput): Promise<void> {
  await tx.insert(truckingEventTable).values({ ...event, companyId });
}

/** The events of a consignment and / or a trip, newest first (at most 200). */
export async function listEvents(companyId: string, about: { consignmentId?: string | null; tripId?: string | null }) {
  const which: SQL[] = [];
  if (about.consignmentId) which.push(eq(e.consignmentId, about.consignmentId));
  if (about.tripId) which.push(eq(e.tripId, about.tripId));
  if (!which.length) return [];
  return db
    .select()
    .from(e)
    .where(and(eq(e.companyId, companyId), or(...which)))
    .orderBy(desc(e.at), desc(e.id))
    .limit(MAX_EVENTS);
}
