import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
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

/** Whether the consignment already has an event of this kind (a redelivered message notes it once). */
export async function hasEvent(reader: Tx | typeof db, companyId: string, consignmentId: string, kind: NewTruckingEventRecord["kind"]): Promise<boolean> {
  const [row] = await reader
    .select({ id: e.id })
    .from(e)
    .where(and(eq(e.companyId, companyId), eq(e.consignmentId, consignmentId), eq(e.kind, kind)))
    .limit(1);
  return !!row;
}

/**
 * The notice keys the consignment's events of this kind recorded (payload.facts.noticeKey): what was
 * noticed once stays known after a manager clears the notice, so it is never noticed again.
 */
export async function recordedNoticeKeys(reader: Tx | typeof db, companyId: string, consignmentId: string, kind: NewTruckingEventRecord["kind"]): Promise<Set<string>> {
  const rows = await reader
    .select({ key: sql<string | null>`${e.payload}->'facts'->>'noticeKey'` })
    .from(e)
    .where(and(eq(e.companyId, companyId), eq(e.consignmentId, consignmentId), eq(e.kind, kind)));
  return new Set(rows.map((r) => r.key).filter((k): k is string => !!k));
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
