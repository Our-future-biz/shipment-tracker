import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { warehouseSectionTable, type WarehouseSectionRecord } from "../schemas/warehouseSection.schema";
import type { WarehouseSectionChange } from "../interfaces/interfaces";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SectionKeyWrite = WarehouseSectionChange;

const asObject = (data: unknown): Record<string, unknown> => (data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {});
const asText = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "string" ? v : JSON.stringify(v));

class WarehouseSectionRepository extends TenantRepository<typeof warehouseSectionTable> {
  constructor() {
    super(db, warehouseSectionTable, "warehouse_section");
  }

  async findByShipmentAndSection(shipmentId: string, section: string, companyId: string): Promise<WarehouseSectionRecord | null> {
    const [row] = await this.db
      .select()
      .from(warehouseSectionTable)
      .where(
        and(
          eq(warehouseSectionTable.companyId, companyId),
          eq(warehouseSectionTable.shipmentId, shipmentId),
          eq(warehouseSectionTable.section, section),
          isNull(warehouseSectionTable.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  // The live section of a kind for a page of shipments, in one query.
  async findManyBySection(shipmentIds: string[], section: string, companyId: string): Promise<Pick<WarehouseSectionRecord, "shipmentId" | "data">[]> {
    return this.db
      .select({ shipmentId: warehouseSectionTable.shipmentId, data: warehouseSectionTable.data })
      .from(warehouseSectionTable)
      .where(
        and(
          eq(warehouseSectionTable.companyId, companyId),
          inArray(warehouseSectionTable.shipmentId, shipmentIds),
          eq(warehouseSectionTable.section, section),
          isNull(warehouseSectionTable.deletedAt),
        ),
      );
  }

  // One statement, so two saves at once can't both insert the same live section.
  async upsert(shipmentId: string, section: string, companyId: string, data: unknown): Promise<WarehouseSectionRecord> {
    const [row] = await this.db
      .insert(warehouseSectionTable)
      .values({ companyId, shipmentId, section, data })
      .onConflictDoUpdate({
        target: [warehouseSectionTable.companyId, warehouseSectionTable.shipmentId, warehouseSectionTable.section],
        targetWhere: sql`deleted_at IS NULL`,
        set: { data, updatedAt: new Date() },
      })
      .returning();
    return row!;
  }

  // Saves only the given fields of a section, so two screens saving different fields (notes, the
  // remeasured lines, "sent" marks) never undo each other. A field sent with `expected` is written
  // only while it still holds that text; otherwise nothing is written and the fields that changed
  // meanwhile are answered. Every write of one section runs under one lock, so a first save never
  // makes two rows and a check never interleaves with another write. `after` runs inside the
  // transaction once the save is in; an error there undoes it.
  async patchKeys(
    shipmentId: string,
    section: string,
    companyId: string,
    changes: SectionKeyWrite[],
    after?: (tx: Tx, row: WarehouseSectionRecord) => Promise<void>,
  ): Promise<{ row: WarehouseSectionRecord; conflicts: null } | { row: null; conflicts: string[] }> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`warehouse_section:${companyId}:${shipmentId}:${section}`}))`);
      const [cur] = await tx
        .select()
        .from(warehouseSectionTable)
        .where(
          and(
            eq(warehouseSectionTable.companyId, companyId),
            eq(warehouseSectionTable.shipmentId, shipmentId),
            eq(warehouseSectionTable.section, section),
            isNull(warehouseSectionTable.deletedAt),
          ),
        )
        .limit(1);
      const data = asObject(cur?.data);
      const conflicts = changes.filter((c) => c.expected !== undefined && asText(data[c.key]) !== c.expected).map((c) => c.key);
      if (conflicts.length) return { row: null, conflicts };
      const next = { ...data };
      for (const c of changes) {
        if (c.value) next[c.key] = c.value;
        else delete next[c.key];
      }
      const [row] = cur
        ? await tx.update(warehouseSectionTable).set({ data: next, updatedAt: new Date() }).where(eq(warehouseSectionTable.id, cur.id)).returning()
        : await tx.insert(warehouseSectionTable).values({ companyId, shipmentId, section, data: next }).returning();
      await after?.(tx, row!);
      return { row: row!, conflicts: null };
    });
  }

  async softDeleteForShipment(shipmentId: string, companyId: string): Promise<void> {
    await this.db
      .update(warehouseSectionTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(warehouseSectionTable.companyId, companyId),
          eq(warehouseSectionTable.shipmentId, shipmentId),
          isNull(warehouseSectionTable.deletedAt),
        ),
      );
  }
}

export const warehouseSectionRepository = new WarehouseSectionRepository();
