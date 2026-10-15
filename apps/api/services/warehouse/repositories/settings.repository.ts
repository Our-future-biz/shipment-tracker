import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/db";
import {
  warehouseSettingsTable,
  warehouseSupplierEmailTable,
  type NewWarehouseSupplierEmailRecord,
  type WarehouseSupplierEmailRecord,
} from "../schemas/warehouseSettings.schema";
import type { DockSettings, SettingsEvent, SupplierEmailSettings } from "../services/settingsRules";
import type { Tx } from "./warehouseSection.repository";

const s = warehouseSettingsTable;
const e = warehouseSupplierEmailTable;
const MAX_SETTINGS_EVENTS = 200;

class SettingsRepository {
  async find(companyId: string, tx: Tx | typeof db = db) {
    const [row] = await tx.select().from(s).where(and(eq(s.companyId, companyId), isNull(s.deletedAt)));
    return row ?? null;
  }

  // Saves the settings only if they are still at `expectedVersion` (0 = none saved yet); null when
  // someone saved meanwhile. The change log keeps the latest MAX_SETTINGS_EVENTS lines.
  async save(
    companyId: string,
    expectedVersion: number,
    values: { supplierEmail: SupplierEmailSettings; docks: DockSettings },
    by: string,
    events: SettingsEvent[],
  ) {
    if (expectedVersion === 0) {
      const [row] = await db
        .insert(s)
        .values({ companyId, ...values, version: 1, updatedBy: by, events })
        .onConflictDoNothing()
        .returning();
      return row ?? null;
    }
    const capped = sql`(SELECT COALESCE(jsonb_agg(x.e ORDER BY x.ord), '[]'::jsonb) FROM (
      SELECT a.e, a.ord FROM jsonb_array_elements(${s.events} || ${JSON.stringify(events)}::jsonb) WITH ORDINALITY AS a(e, ord)
      ORDER BY a.ord DESC LIMIT ${MAX_SETTINGS_EVENTS}) x)`;
    const [row] = await db
      .update(s)
      .set({
        supplierEmail: values.supplierEmail,
        docks: values.docks,
        version: sql`${s.version} + 1`,
        updatedBy: by,
        events: capped,
        updatedAt: new Date(),
      })
      .where(and(eq(s.companyId, companyId), isNull(s.deletedAt), eq(s.version, expectedVersion)))
      .returning();
    return row ?? null;
  }

  // ---- supplier e-mail attempts ----

  /**
   * Starts an attempt under a per position + type lock: refused (returns the attempt in the way)
   * while another one of the same position and type is still being sent; the same request id
   * returns the attempt it already made.
   */
  async startAttempt(row: NewWarehouseSupplierEmailRecord, staleAfterMs: number): Promise<{ attempt: WarehouseSupplierEmailRecord; fresh: boolean }> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`warehouse_supplier_email:${row.companyId}:${row.taskId}:${row.kind}`}))`);
      const [same] = await tx
        .select()
        .from(e)
        .where(and(eq(e.companyId, row.companyId), eq(e.clientRequestId, row.clientRequestId)));
      if (same) return { attempt: same, fresh: false };
      const [busy] = await tx
        .select()
        .from(e)
        .where(
          and(
            eq(e.companyId, row.companyId),
            eq(e.taskId, row.taskId),
            eq(e.kind, row.kind),
            eq(e.status, "sending"),
            sql`${e.createdAt} > now() - make_interval(secs => ${staleAfterMs / 1000})`,
          ),
        )
        .limit(1);
      if (busy) return { attempt: busy, fresh: false };
      const [created] = await tx.insert(e).values(row).returning();
      return { attempt: created!, fresh: true };
    });
  }

  async settle(id: string, companyId: string, values: { status: "sent" | "failed"; error?: string; providerId?: string; sentAt?: Date | null }, tx: Tx | typeof db = db) {
    const [row] = await tx
      .update(e)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(e.id, id), eq(e.companyId, companyId)))
      .returning();
    return row ?? null;
  }

  async listForTask(taskId: string, companyId: string, limit = 30) {
    return db
      .select()
      .from(e)
      .where(and(eq(e.companyId, companyId), eq(e.taskId, taskId), isNull(e.deletedAt)))
      .orderBy(desc(e.createdAt))
      .limit(limit);
  }
}

export const settingsRepository = new SettingsRepository();
