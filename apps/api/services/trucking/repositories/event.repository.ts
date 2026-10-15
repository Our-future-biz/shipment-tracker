import { db, type Tx } from "../db/db";
import { truckingEventTable, type NewTruckingEventRecord } from "../schemas/truckingEvent.schema";

/** An event to append, without the company (the repository that writes it adds it). */
export type TruckingEventInput = Omit<NewTruckingEventRecord, "companyId" | "id" | "at">;

// trucking_event is append-only (a trigger refuses UPDATE and DELETE). Events are written in the
// same transaction as the change they describe, so there is never a change without its event.
export async function appendEvent(tx: Tx | typeof db, companyId: string, event: TruckingEventInput): Promise<void> {
  await tx.insert(truckingEventTable).values({ ...event, companyId });
}
