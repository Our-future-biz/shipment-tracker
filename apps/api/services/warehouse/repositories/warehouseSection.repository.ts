import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import { db } from "../db/db";
import { warehouseSectionTable, type WarehouseSectionRecord } from "../schemas/warehouseSection.schema";
import { PICKUP_SECTION, type PickupHistoryEntry, type PickupRow } from "../services/pickupPin";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const s = warehouseSectionTable;
const pickupRow = (shipmentId: string, companyId: string) =>
  and(eq(s.companyId, companyId), eq(s.shipmentId, shipmentId), eq(s.section, PICKUP_SECTION), isNull(s.deletedAt));
// Tries stored in the section, read defensively (anything that is not a small whole number is 0).
const triesSql = sql`(CASE WHEN ${s.data}->>'pinTries' ~ '^\\d{1,6}$' THEN (${s.data}->>'pinTries')::int ELSE 0 END)`;
const dataObj = sql`(CASE WHEN jsonb_typeof(${s.data}) = 'object' THEN ${s.data} ELSE '{}'::jsonb END)`;

class WarehouseSectionRepository {
  async findByShipmentAndSection(shipmentId: string, section: string, companyId: string) {
    const [row] = await db
      .select()
      .from(warehouseSectionTable)
      .where(
        and(
          eq(warehouseSectionTable.companyId, companyId),
          eq(warehouseSectionTable.shipmentId, shipmentId),
          eq(warehouseSectionTable.section, section),
          isNull(warehouseSectionTable.deletedAt),
        ),
      );
    return row ?? null;
  }

  // Saves only the given keys of a section's data (`data || changes`), so two people saving
  // different fields never overwrite each other. Each key is written only while its stored value
  // is still what the client last saw (`expected`, "" = absent); otherwise nothing is written
  // and the keys that changed meanwhile are returned. `onCreate` runs when the section row is
  // made by this save (inside the transaction; it may throw to refuse it).
  async patchKeys(
    shipmentId: string,
    section: string,
    companyId: string,
    changes: { key: string; value: string; expected: string }[],
    onCreate: () => Promise<void>,
  ): Promise<{ row: WarehouseSectionRecord; conflicts: null } | { row: null; conflicts: string[] }> {
    return db.transaction(async (tx) => {
      // A missing section is made; a deleted one starts afresh (empty, like a new one). A live
      // one is left as it is (the update below then checks and writes it).
      const created = await tx
        .insert(s)
        .values({ companyId, shipmentId, section, data: {} })
        .onConflictDoUpdate({
          target: [s.companyId, s.shipmentId, s.section],
          set: { data: {}, deletedAt: null, version: sql`${s.version} + 1`, updatedAt: new Date() },
          setWhere: sql`${s.deletedAt} IS NOT NULL`,
        })
        .returning({ id: s.id });
      if (created.length) await onCreate();
      const patch = Object.fromEntries(changes.map((c) => [c.key, c.value]));
      const stillAsSeen = changes.map((c) => sql`COALESCE(${dataObj}->>${c.key}, '') = ${c.expected}`);
      const where = and(eq(s.companyId, companyId), eq(s.shipmentId, shipmentId), eq(s.section, section), isNull(s.deletedAt));
      const [row] = await tx
        .update(s)
        .set({ data: sql`${dataObj} || ${JSON.stringify(patch)}::jsonb`, version: sql`${s.version} + 1`, updatedAt: new Date() })
        .where(and(where, ...stillAsSeen))
        .returning();
      if (row) return { row, conflicts: null };
      const [cur] = await tx.select().from(s).where(where);
      const data = cur?.data && typeof cur.data === "object" && !Array.isArray(cur.data) ? (cur.data as Record<string, unknown>) : {};
      const asText = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "string" ? v : JSON.stringify(v));
      return { row: null, conflicts: changes.filter((c) => asText(data[c.key]) !== c.expected).map((c) => c.key) };
    });
  }

  // Every write of a pick-up section runs under this per-shipment lock, so a rows save, a new
  // PIN and a PIN check that ticks the release gate never interleave.
  async withPickupLock<T>(shipmentId: string, companyId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`warehouse_pickup:${companyId}:${shipmentId}`}))`);
      return fn(tx);
    });
  }

  async findPickup(shipmentId: string, companyId: string, tx: Tx | typeof db = db) {
    const [row] = await tx.select().from(s).where(pickupRow(shipmentId, companyId));
    return row ?? null;
  }

  async findPickupForShipments(shipmentIds: string[], companyId: string) {
    if (!shipmentIds.length) return [];
    return db
      .select()
      .from(s)
      .where(and(eq(s.companyId, companyId), inArray(s.shipmentId, shipmentIds), eq(s.section, PICKUP_SECTION), isNull(s.deletedAt)));
  }

  // Saves only the haulier / plate / driver rows. The PIN fields are the server's: the rows key
  // is replaced inside the stored data and everything else is kept as it is in the database.
  async upsertPickupRows(shipmentId: string, companyId: string, rows: PickupRow[]) {
    const rowsText = JSON.stringify(rows);
    return this.withPickupLock(shipmentId, companyId, async (tx) => {
      const [updated] = await tx
        .update(s)
        .set({ data: sql`(${dataObj} - 'rows') || jsonb_build_object('rows', ${rowsText}::text)`, version: sql`${s.version} + 1`, updatedAt: new Date() })
        .where(pickupRow(shipmentId, companyId))
        .returning();
      if (updated) return updated;
      const [row] = await tx.insert(s).values({ companyId, shipmentId, section: PICKUP_SECTION, data: { rows: rowsText } }).returning();
      return row!;
    });
  }

  // Sets a new pick-up PIN — only when there is none yet, or the current one is locked (`max`
  // wrong tries). Tries start again at 0 and the change is added to the PIN history. `after`
  // runs in the same transaction (the gate rows go back to Pending there).
  // Null when a PIN exists and is not locked.
  async setPickupPin(
    shipmentId: string,
    companyId: string,
    p: { pin: string; pinId: string; at: string; by: string },
    max: number,
    after: (tx: Tx, kind: PickupHistoryEntry["kind"]) => Promise<void>,
  ) {
    return this.withPickupLock(shipmentId, companyId, async (tx) => {
      const [cur] = await tx
        .select({ id: s.id, pin: sql<string>`COALESCE(${dataObj}->>'pin', '')`, tries: sql<number>`${triesSql}` })
        .from(s)
        .where(pickupRow(shipmentId, companyId))
        .for("update");
      const hasPin = !!cur && cur.pin.trim() !== "";
      if (hasPin && cur.tries < max) return null;
      const kind: PickupHistoryEntry["kind"] = hasPin ? "renewed" : "created";
      const entry: PickupHistoryEntry = { kind, at: p.at, by: p.by };
      const fields = { pin: p.pin, pinId: p.pinId, pinTries: 0, pinCreatedAt: p.at, pinCreatedBy: p.by };
      let row;
      if (cur) {
        [row] = await tx
          .update(s)
          .set({
            data: sql`${dataObj} || ${JSON.stringify(fields)}::jsonb || jsonb_build_object('pinHistory',
              (CASE WHEN jsonb_typeof(${dataObj}->'pinHistory') = 'array' THEN ${dataObj}->'pinHistory' ELSE '[]'::jsonb END) || ${JSON.stringify([entry])}::jsonb)`,
            version: sql`${s.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(s.id, cur.id))
          .returning();
      } else {
        [row] = await tx
          .insert(s)
          .values({ companyId, shipmentId, section: PICKUP_SECTION, data: { ...fields, rows: "[]", pinHistory: [entry] } })
          .returning();
      }
      await after(tx, kind);
      return { row: row!, kind };
    });
  }

  // Takes one try before the PIN is checked, only while the PIN is set and tries are left, so
  // parallel wrong guesses cannot get more than `max`. Null when there is no PIN or no try left.
  async takePickupPinTry(shipmentId: string, companyId: string, max: number) {
    const [row] = await db
      .update(s)
      .set({ data: sql`jsonb_set(${s.data}, '{pinTries}', to_jsonb(${triesSql} + 1))`, updatedAt: new Date() })
      .where(
        and(
          pickupRow(shipmentId, companyId),
          sql`jsonb_typeof(${s.data}) = 'object'`,
          sql`btrim(COALESCE(${s.data}->>'pin', '')) <> ''`,
          sql`${triesSql} < ${max}`,
        ),
      )
      .returning({ pin: sql<string>`${s.data}->>'pin'`, pinId: sql<string>`COALESCE(${s.data}->>'pinId', '')`, pinTries: sql<number>`${triesSql}` });
    return row ? { pin: row.pin, pinId: row.pinId, pinTries: Number(row.pinTries) } : null;
  }

  // A matching PIN gives its try back — only to the same PIN (a renewed PIN starts at 0 anyway).
  async refundPickupPinTry(shipmentId: string, companyId: string, pinId: string) {
    await db
      .update(s)
      .set({ data: sql`jsonb_set(${s.data}, '{pinTries}', to_jsonb(GREATEST(${triesSql} - 1, 0)))` })
      .where(and(pickupRow(shipmentId, companyId), sql`jsonb_typeof(${s.data}) = 'object'`, sql`COALESCE(${s.data}->>'pinId', '') = ${pinId}`));
  }
}

export const warehouseSectionRepository = new WarehouseSectionRepository();
