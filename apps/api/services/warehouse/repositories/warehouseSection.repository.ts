import { eq, and, desc, isNull, isNotNull, inArray, sql } from "drizzle-orm";
import { db } from "../db/db";
import { warehouseSectionTable, type WarehouseSectionRecord } from "../schemas/warehouseSection.schema";
import { warehouseTaskTable } from "../schemas/warehouseTask.schema";
import { PICKUP_SECTION, type PickupHistoryEntry, type PickupRow } from "../services/pickupPin";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const s = warehouseSectionTable;
// The pick-up section stays keyed to the shipment (Shipments enters it): never owned by a position.
const pickupRow = (shipmentId: string, companyId: string) =>
  and(eq(s.companyId, companyId), eq(s.shipmentId, shipmentId), eq(s.section, PICKUP_SECTION), isNull(s.deletedAt), isNull(s.taskId));
// Tries stored in the section, read defensively (anything that is not a small whole number is 0).
const triesSql = sql`(CASE WHEN ${s.data}->>'pinTries' ~ '^\\d{1,6}$' THEN (${s.data}->>'pinTries')::int ELSE 0 END)`;
const dataObj = sql`(CASE WHEN jsonb_typeof(${s.data}) = 'object' THEN ${s.data} ELSE '{}'::jsonb END)`;

/**
 * Who a section belongs to: a warehouse position (task; `shipmentId` is its shipment, if any,
 * kept on the row for information) or — for shipments with no position, and legacy rows — the
 * shipment itself.
 */
export type SectionOwner = { kind: "task"; taskId: string; shipmentId: string | null } | { kind: "shipment"; shipmentId: string };

const MAX_SENT_HISTORY = 50;
const live = (companyId: string, section: string) => and(eq(s.companyId, companyId), eq(s.section, section), isNull(s.deletedAt));
// A row of the shipment no live position owns: a legacy row (no task) or a row of a position
// that was removed. A position of that shipment takes it over on its first write.
const adoptableRow = (companyId: string, shipmentId: string, section: string) =>
  and(
    live(companyId, section),
    eq(s.shipmentId, shipmentId),
    sql`${s.section} <> ${PICKUP_SECTION}`,
    sql`(${s.taskId} IS NULL OR NOT EXISTS (
      SELECT 1 FROM ${warehouseTaskTable} wt WHERE wt.id = ${s.taskId} AND wt.deleted_at IS NULL))`,
  );

class WarehouseSectionRepository {
  async findByTask(taskId: string, section: string, companyId: string, tx: Tx | typeof db = db): Promise<WarehouseSectionRecord | null> {
    const [row] = await tx.select().from(s).where(and(live(companyId, section), eq(s.taskId, taskId)));
    return row ?? null;
  }

  // The row of a shipment that no live position owns (see adoptableRow), newest first.
  async findAdoptable(shipmentId: string, section: string, companyId: string, tx: Tx | typeof db = db): Promise<WarehouseSectionRecord | null> {
    const [row] = await tx
      .select()
      .from(s)
      .where(adoptableRow(companyId, shipmentId, section))
      .orderBy(desc(s.updatedAt))
      .limit(1);
    return row ?? null;
  }

  // A position takes over its shipment's section row on its first write (idempotent: nothing
  // happens once the position has a row of its own). Returns the position's row, or null.
  async adoptLegacy(tx: Tx, companyId: string, taskId: string, shipmentId: string, section: string): Promise<WarehouseSectionRecord | null> {
    const own = await this.findByTask(taskId, section, companyId, tx);
    if (own) return own;
    const old = await this.findAdoptable(shipmentId, section, companyId, tx);
    if (!old) return null;
    const [row] = await tx.update(s).set({ taskId, updatedAt: new Date() }).where(eq(s.id, old.id)).returning();
    return row ?? null;
  }

  // The migration 0015 backfill: every live non-pick-up row of a shipment that has a live
  // position, and no position yet, gets the position's id. Safe to run again. A copy of the
  // UPDATE in 0015_section_per_task_exceptions.sql — keep the two the same
  // (tests/sectionPerTask.test.ts runs the migration's own statement). 0015 compares the ids as
  // text (it runs before 0019 makes shipment_id a uuid, and after main's 0003 did); here both
  // columns are uuid.
  async backfillTaskIds(tx: Tx | typeof db = db): Promise<number> {
    const res = await tx.execute(sql`
      UPDATE ${s} SET task_id = t.id, updated_at = now()
      FROM ${warehouseTaskTable} t
      WHERE t.company_id = ${s.companyId} AND t.deleted_at IS NULL AND t.shipment_id IS NOT NULL
        AND t.shipment_id = ${s.shipmentId} AND ${s.section} <> ${PICKUP_SECTION}
        AND ${s.taskId} IS NULL AND ${s.deletedAt} IS NULL`);
    return res.rowCount ?? 0;
  }

  // Every write of an owner's section runs under these locks (the shipment's first, then the
  // position's), so a first save, a take-over and a "mark as sent" never interleave.
  private async lockOwner(tx: Tx, companyId: string, owner: SectionOwner, section: string) {
    const ship = owner.shipmentId ? [`warehouse_section:${companyId}:shipment:${owner.shipmentId}:${section}`] : [];
    const task = owner.kind === "task" ? [`warehouse_section:${companyId}:task:${owner.taskId}:${section}`] : [];
    for (const key of [...ship, ...task]) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
  }

  // The owner's row, made when missing (`onCreate` runs then, inside the transaction, and may
  // throw to refuse it). A position first takes over its shipment's row.
  private async ownRow(tx: Tx, companyId: string, owner: SectionOwner, section: string, onCreate?: () => Promise<void>): Promise<WarehouseSectionRecord> {
    let row =
      owner.kind === "task"
        ? owner.shipmentId
          ? await this.adoptLegacy(tx, companyId, owner.taskId, owner.shipmentId, section)
          : await this.findByTask(owner.taskId, section, companyId, tx)
        : await this.findAdoptable(owner.shipmentId, section, companyId, tx);
    if (row) return row;
    [row] = await tx
      .insert(s)
      .values({ companyId, section, data: {}, taskId: owner.kind === "task" ? owner.taskId : null, shipmentId: owner.shipmentId })
      .returning();
    await onCreate?.();
    return row!;
  }

  // Saves only the given keys of a section's data (`data || changes`), so two people saving
  // different fields never overwrite each other. Each key is written only while its stored value
  // is still what the client last saw (`expected`, "" = absent); otherwise nothing is written
  // and the keys that changed meanwhile are returned. `extra` keys are written with the save
  // (never checked). `onCreate` runs when the section row is made by this save; `after` runs
  // after a save that landed — both inside the transaction.
  async patchKeys(
    owner: SectionOwner,
    section: string,
    companyId: string,
    changes: { key: string; value: string; expected: string }[],
    hooks: { onCreate?: () => Promise<void>; after?: (tx: Tx, row: WarehouseSectionRecord) => Promise<void>; extra?: Record<string, string> } = {},
  ): Promise<{ row: WarehouseSectionRecord; conflicts: null } | { row: null; conflicts: string[] }> {
    return db.transaction(async (tx) => {
      await this.lockOwner(tx, companyId, owner, section);
      const cur = await this.ownRow(tx, companyId, owner, section, hooks.onCreate);
      const patch = { ...Object.fromEntries(changes.map((c) => [c.key, c.value])), ...hooks.extra };
      const stillAsSeen = changes.map((c) => sql`COALESCE(${dataObj}->>${c.key}, '') = ${c.expected}`);
      const [row] = await tx
        .update(s)
        .set({ data: sql`${dataObj} || ${JSON.stringify(patch)}::jsonb`, version: sql`${s.version} + 1`, updatedAt: new Date() })
        .where(and(eq(s.id, cur.id), ...stillAsSeen))
        .returning();
      if (row) {
        await hooks.after?.(tx, row);
        return { row, conflicts: null };
      }
      const data = cur.data && typeof cur.data === "object" && !Array.isArray(cur.data) ? (cur.data as Record<string, unknown>) : {};
      const asText = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "string" ? v : JSON.stringify(v));
      return { row: null, conflicts: changes.filter((c) => asText(data[c.key]) !== c.expected).map((c) => c.key) };
    });
  }

  // "Mark as sent" (a resend is allowed): sets `key` to `value` and adds `entry` to the list
  // `<key>_history` (the latest MAX_SENT_HISTORY kept) in one UPDATE, so two sends at once both
  // stay in the history. `after` runs in the same transaction.
  async markSent(
    owner: SectionOwner,
    section: string,
    companyId: string,
    key: string,
    value: string,
    entry: Record<string, string>,
    after?: (tx: Tx, row: WarehouseSectionRecord) => Promise<void>,
  ): Promise<WarehouseSectionRecord> {
    return db.transaction(async (tx) => {
      await this.lockOwner(tx, companyId, owner, section);
      const cur = await this.ownRow(tx, companyId, owner, section);
      const histKey = `${key}_history`;
      const hist = sql`((CASE WHEN jsonb_typeof(${dataObj}->${histKey}) = 'array' THEN ${dataObj}->${histKey} ELSE '[]'::jsonb END) || ${JSON.stringify([entry])}::jsonb)`;
      const capped = sql`(SELECT COALESCE(jsonb_agg(x.e ORDER BY x.ord), '[]'::jsonb) FROM (
        SELECT a.e, a.ord FROM jsonb_array_elements(${hist}) WITH ORDINALITY AS a(e, ord) ORDER BY a.ord DESC LIMIT ${MAX_SENT_HISTORY}) x)`;
      const [row] = await tx
        .update(s)
        .set({
          data: sql`${dataObj} || jsonb_build_object(${key}::text, ${value}::text, ${histKey}::text, ${capped})`,
          version: sql`${s.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(s.id, cur.id))
        .returning();
      await after?.(tx, row!);
      return row!;
    });
  }

  // Live sections of one kind that belong to positions, for the worklist summary.
  async listForTasks(companyId: string, section: string) {
    return db
      .select({ taskId: s.taskId, data: s.data, version: s.version, updatedAt: s.updatedAt })
      .from(s)
      .where(and(live(companyId, section), isNotNull(s.taskId)));
  }

  // Every write of a pick-up section runs under this per-shipment lock, so a rows save, a new
  // PIN and a PIN check that ticks the release gate never interleave.
  async withPickupLock<T>(shipmentId: string, companyId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`warehouse_pickup:${companyId}:${shipmentId}`}))`);
      return fn(tx);
    });
  }

  async findPickup(shipmentId: string, companyId: string, tx: Tx | typeof db = db): Promise<WarehouseSectionRecord | null> {
    const [row] = await tx.select().from(s).where(pickupRow(shipmentId, companyId));
    return row ?? null;
  }

  async findPickupForShipments(shipmentIds: string[], companyId: string): Promise<WarehouseSectionRecord[]> {
    if (!shipmentIds.length) return [];
    return db
      .select()
      .from(s)
      .where(and(eq(s.companyId, companyId), inArray(s.shipmentId, shipmentIds), eq(s.section, PICKUP_SECTION), isNull(s.deletedAt), isNull(s.taskId)));
  }

  // Saves only the haulier / plate / driver rows. The PIN fields are the server's: the rows key
  // is replaced inside the stored data and everything else is kept as it is in the database.
  async upsertPickupRows(shipmentId: string, companyId: string, rows: PickupRow[]): Promise<WarehouseSectionRecord> {
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

  // A shipment deleted in Shipments, with no warehouse position left: its pick-up row and the
  // section rows no position owns (task_id null) are retired. Rows of removed positions stay with
  // them (archived), so restoring a position brings its sections back.
  async softDeleteForShipment(shipmentId: string, companyId: string): Promise<number> {
    const rows = await db
      .update(s)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(s.companyId, companyId), eq(s.shipmentId, shipmentId), isNull(s.taskId), isNull(s.deletedAt)))
      .returning({ id: s.id });
    return rows.length;
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
