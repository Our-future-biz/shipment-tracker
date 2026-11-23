import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/db";
import {
  coLoadingServiceTable as services,
  type CoLoadingServiceRecord,
  type NewCoLoadingServiceRecord,
} from "../schemas/coLoadingService.schema";

// Co-Loading Concept's services (lib/coLoadingService), always read within one company.
class CoLoadingServiceRepository {
  /** The company's live services, the oldest first, so a new one is the last tile. */
  async list(companyId: string): Promise<CoLoadingServiceRecord[]> {
    return db
      .select()
      .from(services)
      .where(and(eq(services.companyId, companyId), isNull(services.deletedAt)))
      .orderBy(asc(services.createdAt));
  }

  async get(id: string, companyId: string): Promise<CoLoadingServiceRecord | null> {
    const [row] = await db
      .select()
      .from(services)
      .where(and(eq(services.id, id), eq(services.companyId, companyId), isNull(services.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /** The company's live service of this name, whatever the case: the one a new name clashes with. */
  async byName(name: string, companyId: string): Promise<CoLoadingServiceRecord | null> {
    const [row] = await db
      .select()
      .from(services)
      .where(and(eq(services.companyId, companyId), isNull(services.deletedAt), sql`lower(${services.name}) = lower(${name})`))
      .limit(1);
    return row ?? null;
  }

  /** Closes the service (by `who`) or reopens it (null); the service as it is now, null when not found. */
  async setClosed(
    id: string,
    companyId: string,
    who: { id: string; name: string } | null,
  ): Promise<CoLoadingServiceRecord | null> {
    const [row] = await db
      .update(services)
      .set(
        who
          ? { closedAt: new Date(), closedById: who.id, closedByName: who.name, updatedAt: new Date() }
          : { closedAt: null, closedById: null, closedByName: "", updatedAt: new Date() },
      )
      .where(and(eq(services.id, id), eq(services.companyId, companyId), isNull(services.deletedAt)))
      .returning();
    return row ?? null;
  }

  /** Sets the service's inland weight (null for none); the service as it is now, null when not found. */
  async setInlandWeight(id: string, companyId: string, inlandWeightKg: number | null): Promise<CoLoadingServiceRecord | null> {
    const [row] = await db
      .update(services)
      .set({ inlandWeightKg, updatedAt: new Date() })
      .where(and(eq(services.id, id), eq(services.companyId, companyId), isNull(services.deletedAt)))
      .returning();
    return row ?? null;
  }

  /** The new service; null when the company has a live one of that name already (any case). */
  async create(values: NewCoLoadingServiceRecord): Promise<CoLoadingServiceRecord | null> {
    const [row] = await db
      .insert(services)
      .values(values)
      // The one unique index besides the id is the live name per company (co_loading_service_name_unique).
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  }
}

export const coLoadingServiceRepository = new CoLoadingServiceRepository();
