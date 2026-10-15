import { and, asc, desc, eq, inArray, isNull, ne, type SQL } from "drizzle-orm";
import { db, type Tx } from "../db/db";
import { truckingGateEventTable, truckingLegTable, type NewTruckingLegRecord, type TruckingLegRecord } from "../schemas/truckingConsignment.schema";
import type { LegKind, LegStatus } from "../interfaces/interfaces";

const l = truckingLegTable;
const MAX_OPEN = 2000;

export type LegValues = Partial<Omit<NewTruckingLegRecord, "id" | "companyId" | "consignmentId" | "createdAt">>;

/** What must still hold for a guarded leg write to go through. */
export interface LegGuard {
  status?: LegStatus;
  /** On this trip; null = on no trip */
  tripId?: string | null;
}

function guardSql(g: LegGuard): SQL[] {
  const out: SQL[] = [];
  if (g.status) out.push(eq(l.status, g.status));
  if (g.tripId === null) out.push(isNull(l.tripId));
  else if (g.tripId) out.push(eq(l.tripId, g.tripId));
  return out;
}

const live = (companyId: string) => [eq(l.companyId, companyId), isNull(l.deletedAt)];

// The LTL legs of consignments (FTL DIRECT legs are written by the consignment repository).
class LegRepository {
  async insertMany(tx: Tx, rows: NewTruckingLegRecord[]): Promise<TruckingLegRecord[]> {
    if (!rows.length) return [];
    return tx.insert(l).values(rows).returning();
  }

  async find(companyId: string, id: string, reader: Tx | typeof db = db): Promise<TruckingLegRecord | null> {
    const [row] = await reader.select().from(l).where(and(...live(companyId), eq(l.id, id)));
    return row ?? null;
  }

  async findMany(companyId: string, ids: string[], reader: Tx | typeof db = db): Promise<TruckingLegRecord[]> {
    if (!ids.length) return [];
    return reader.select().from(l).where(and(...live(companyId), inArray(l.id, ids)));
  }

  /** The live legs of consignments, in road order. */
  async forConsignments(companyId: string, consignmentIds: string[], reader: Tx | typeof db = db): Promise<TruckingLegRecord[]> {
    if (!consignmentIds.length) return [];
    return reader
      .select()
      .from(l)
      .where(and(...live(companyId), inArray(l.consignmentId, consignmentIds)))
      .orderBy(asc(l.consignmentId), asc(l.seq));
  }

  /** The live legs on trips. */
  async forTrips(companyId: string, tripIds: string[], reader: Tx | typeof db = db): Promise<TruckingLegRecord[]> {
    if (!tripIds.length) return [];
    return reader.select().from(l).where(and(...live(companyId), inArray(l.tripId, tripIds)));
  }

  /** Legs of a kind still waiting for a trip (at most 2000). */
  async open(companyId: string, kind: LegKind): Promise<TruckingLegRecord[]> {
    return db
      .select()
      .from(l)
      .where(and(...live(companyId), eq(l.kind, kind), eq(l.status, "OPEN"), isNull(l.tripId)))
      .orderBy(asc(l.createdAt))
      .limit(MAX_OPEN);
  }

  /** A partner's deliveries: live delivery legs on no trip given to the haulier (priced or done), at most 2000. */
  async partnerFor(companyId: string, haulierCustomerId: string): Promise<TruckingLegRecord[]> {
    return db
      .select()
      .from(l)
      .where(and(...live(companyId), eq(l.kind, "DELIVERY"), isNull(l.tripId), eq(l.haulierCustomerId, haulierCustomerId), ne(l.status, "OPEN")))
      .orderBy(desc(l.createdAt))
      .limit(MAX_OPEN);
  }

  /** Writes `values` when the guard still holds; null when it no longer does. */
  async update(tx: Tx, companyId: string, id: string, values: LegValues, guard: LegGuard = {}): Promise<TruckingLegRecord | null> {
    const [row] = await tx
      .update(l)
      .set({ ...values, updatedAt: new Date() })
      .where(and(...live(companyId), eq(l.id, id), ...guardSql(guard)))
      .returning();
    return row ?? null;
  }

  /** Soft-deletes legs (a consignment's plan changed or it was cancelled). */
  async retire(tx: Tx, companyId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const now = new Date();
    await tx.update(l).set({ deletedAt: now, updatedAt: now }).where(and(...live(companyId), inArray(l.id, ids)));
  }

  /**
   * Records a gate event heard from the warehouse once per (position, kind, time). False when it
   * was heard before (the message was delivered again).
   */
  async recordGateEvent(
    tx: Tx,
    values: { companyId: string; shipmentId: string | null; positionId: string; wczRef: string; kind: "gateIn" | "gateOut" | "voided"; stampKind: string; at: Date; userId: string },
  ): Promise<boolean> {
    const rows = await tx
      .insert(truckingGateEventTable)
      .values(values)
      .onConflictDoNothing({ target: [truckingGateEventTable.companyId, truckingGateEventTable.positionId, truckingGateEventTable.kind, truckingGateEventTable.at] })
      .returning({ id: truckingGateEventTable.id });
    return rows.length > 0;
  }

  /** Whether a gate event of `kind` was received for the warehouse position (applied or not). */
  async hasGateEvent(tx: Tx, companyId: string, positionId: string, kind: "gateIn" | "gateOut" | "voided"): Promise<boolean> {
    const rows = await tx
      .select({ id: truckingGateEventTable.id })
      .from(truckingGateEventTable)
      .where(and(eq(truckingGateEventTable.companyId, companyId), eq(truckingGateEventTable.positionId, positionId), eq(truckingGateEventTable.kind, kind)))
      .limit(1);
    return rows.length > 0;
  }
}

export const legRepository = new LegRepository();
