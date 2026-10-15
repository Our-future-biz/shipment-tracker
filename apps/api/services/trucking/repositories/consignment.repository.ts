import { and, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { APIError } from "encore.dev/api";
import { db, type Tx } from "../db/db";
import {
  truckingConsignmentTable,
  truckingLegTable,
  truckingRefCounterTable,
  type NewTruckingConsignmentRecord,
  type TruckingConsignmentRecord,
  type TruckingRefSequence,
} from "../schemas/truckingConsignment.schema";
import type { ConsignmentStatus, StampKind } from "../interfaces/interfaces";
import { formatTruckingRef, MAX_REF_NUMBER } from "../lib/consignmentRules";
import type { LegRealCost } from "../lib/haulierCost";
import { legCostParts } from "./legCost.sql";

const c = truckingConsignmentTable;
const MAX_LIST = 1000;

/** The columns of each stamp. */
export const STAMP_COLUMNS = {
  confirmed: { at: "confirmedAt", by: "confirmedBy" },
  pickedUp: { at: "pickedUpAt", by: "pickedUpBy" },
  delivered: { at: "deliveredAt", by: "deliveredBy" },
  podReceived: { at: "podReceivedAt", by: "podReceivedBy" },
} as const satisfies Record<StampKind, { at: keyof TruckingConsignmentRecord; by: keyof TruckingConsignmentRecord }>;

/** Columns a write may set (the version is bumped by the repository). */
export type ConsignmentValues = Partial<Omit<NewTruckingConsignmentRecord, "id" | "companyId" | "version" | "createdAt">>;

/** What must still hold for a guarded write to go through. */
export interface ConsignmentGuard {
  /** The version read */
  version?: number;
  /** This stamp is still empty (and the consignment not cancelled) */
  stampEmpty?: StampKind;
  /** This stamp is set */
  stampSet?: StampKind;
  /** Not cancelled and nothing picked up yet */
  beforePickup?: boolean;
  /** On no trip and not cancelled */
  withoutTrip?: boolean;
  /** On this trip */
  tripId?: string;
  /** Not cancelled */
  live?: boolean;
}

function guardSql(g: ConsignmentGuard): SQL[] {
  const out: SQL[] = [];
  if (g.version !== undefined) out.push(eq(c.version, g.version));
  if (g.stampEmpty) out.push(isNull(c[STAMP_COLUMNS[g.stampEmpty].at]), isNull(c.cancelledAt));
  if (g.stampSet) out.push(isNotNull(c[STAMP_COLUMNS[g.stampSet].at]));
  if (g.beforePickup) out.push(isNull(c.cancelledAt), isNull(c.pickedUpAt));
  if (g.withoutTrip) out.push(isNull(c.tripId), isNull(c.cancelledAt));
  if (g.tripId) out.push(eq(c.tripId, g.tripId));
  if (g.live) out.push(isNull(c.cancelledAt));
  return out;
}

class ConsignmentRepository {
  /**
   * The next TCZ / LCZ reference of the company for the Prague year. The counter row is bumped in
   * one statement and stays locked until the caller's transaction ends, so a parallel create
   * waits and gets the next number, and a rolled-back create gives its number back.
   */
  async allocateRef(tx: Tx, companyId: string, sequence: Exclude<TruckingRefSequence, "ICZ">, year: number): Promise<string> {
    const res = await tx.execute<{ last: number }>(sql`
      INSERT INTO ${truckingRefCounterTable} (company_id, sequence, year, last) VALUES (${companyId}, ${sequence}, ${year}, 1)
      ON CONFLICT (company_id, sequence, year) DO UPDATE SET last = ${truckingRefCounterTable}.last + 1, updated_at = now()
      RETURNING last`);
    const n = Number(res.rows[0]!.last);
    if (n > MAX_REF_NUMBER) throw APIError.resourceExhausted(`${sequence} references for ${year} are used up`);
    return formatTruckingRef(sequence, year, n);
  }

  async insert(tx: Tx, values: NewTruckingConsignmentRecord): Promise<TruckingConsignmentRecord> {
    const [row] = await tx.insert(c).values(values).returning();
    return row!;
  }

  async find(companyId: string, id: string, reader: Tx | typeof db = db): Promise<TruckingConsignmentRecord | null> {
    const [row] = await reader.select().from(c).where(and(eq(c.companyId, companyId), eq(c.id, id), isNull(c.deletedAt)));
    return row ?? null;
  }

  async findMany(companyId: string, ids: string[], reader: Tx | typeof db = db): Promise<TruckingConsignmentRecord[]> {
    if (!ids.length) return [];
    return reader.select().from(c).where(and(eq(c.companyId, companyId), inArray(c.id, ids), isNull(c.deletedAt)));
  }

  /** The consignment of an FTL trip (live trip link). */
  async findByTrip(companyId: string, tripId: string, reader: Tx | typeof db = db): Promise<TruckingConsignmentRecord | null> {
    const [row] = await reader.select().from(c).where(and(eq(c.companyId, companyId), eq(c.tripId, tripId), isNull(c.deletedAt)));
    return row ?? null;
  }

  /** The consignments on these trips. */
  async findByTrips(companyId: string, tripIds: string[]): Promise<TruckingConsignmentRecord[]> {
    if (!tripIds.length) return [];
    return db.select().from(c).where(and(eq(c.companyId, companyId), inArray(c.tripId, tripIds), isNull(c.deletedAt)));
  }

  /** The worklist: by status and / or job, newest pick-up first (at most 1000). */
  async list(companyId: string, filter: { status?: ConsignmentStatus; shipmentId?: string }): Promise<TruckingConsignmentRecord[]> {
    const clauses: SQL[] = [eq(c.companyId, companyId), isNull(c.deletedAt)];
    if (filter.status) clauses.push(eq(c.status, filter.status));
    if (filter.shipmentId) clauses.push(eq(c.shipmentId, filter.shipmentId));
    return db.select().from(c).where(and(...clauses)).orderBy(desc(c.pickupDate), desc(c.createdAt)).limit(MAX_LIST);
  }

  /** The live LTL consignments of a job (not cancelled), locked for the caller's transaction. */
  async ltlForShipmentLocked(tx: Tx, companyId: string, shipmentId: string): Promise<TruckingConsignmentRecord[]> {
    return tx
      .select()
      .from(c)
      .where(and(eq(c.companyId, companyId), eq(c.shipmentId, shipmentId), eq(c.scope, "LTL"), isNull(c.cancelledAt), isNull(c.deletedAt)))
      .for("update");
  }

  /** Every live consignment of a job (cancelled ones included), locked for the caller's transaction. */
  async forShipmentLocked(tx: Tx, companyId: string, shipmentId: string): Promise<TruckingConsignmentRecord[]> {
    return tx.select().from(c).where(and(eq(c.companyId, companyId), eq(c.shipmentId, shipmentId), isNull(c.deletedAt))).for("update");
  }

  /**
   * Writes `values` only when the row still matches the guard (its version, a stamp still empty,
   * …) and is not deleted; bumps the version. Null when nothing matched: someone changed the
   * consignment meanwhile, or the guarded state no longer holds.
   */
  async update(tx: Tx, companyId: string, id: string, values: ConsignmentValues, guard: ConsignmentGuard = {}): Promise<TruckingConsignmentRecord | null> {
    const [row] = await tx
      .update(c)
      .set({ ...values, version: sql`${c.version} + 1`, updatedAt: new Date() })
      .where(and(eq(c.companyId, companyId), eq(c.id, id), isNull(c.deletedAt), ...guardSql(guard)))
      .returning();
    return row ?? null;
  }

  /** The leg of an FTL consignment on its trip. */
  async insertLeg(tx: Tx, companyId: string, consignmentId: string, tripId: string): Promise<void> {
    await tx.insert(truckingLegTable).values({ companyId, consignmentId, tripId, seq: 1, kind: "DIRECT", status: "PLANNED" });
  }

  /** Soft-deletes the FTL (DIRECT) legs of a trip. */
  async retireLegs(tx: Tx, companyId: string, tripId: string): Promise<void> {
    const now = new Date();
    await tx
      .update(truckingLegTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(truckingLegTable.companyId, companyId), eq(truckingLegTable.tripId, tripId), isNull(truckingLegTable.deletedAt)));
  }

  /** The real costs of these consignments' live legs: those an approved haulier invoice line covers (as the Reports count them). */
  async legRealCosts(companyId: string, consignmentIds: string[]): Promise<LegRealCost[]> {
    if (!consignmentIds.length) return [];
    const ids = sql`SELECT jsonb_array_elements_text(${JSON.stringify(consignmentIds)}::jsonb)::uuid`;
    const { rows } = await db.execute<Record<string, unknown>>(sql`
      SELECT p.leg_id, p.consignment_id, p.trip_id, p.real_czk, p.invoice_number
      FROM (${legCostParts(companyId, ids)}) p WHERE p.real_czk IS NOT NULL`);
    return rows.map((r) => ({
      legId: String(r.leg_id),
      consignmentId: String(r.consignment_id),
      tripId: r.trip_id == null ? null : String(r.trip_id),
      realCzk: Number(r.real_czk),
      invoiceNumber: String(r.invoice_number ?? ""),
    }));
  }
}

export const consignmentRepository = new ConsignmentRepository();
