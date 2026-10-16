-- Main's warehouse 0003_typed_shipment_and_due_date, renumbered to 0019 (our chain already used
-- 0003..0018) and rewritten for the position-based sections (0015) so it is safe on any database:
-- one that ran only our chain (columns still text), and one that already ran main's 0003
-- (columns already typed; our 0003 was skipped there). Hand-edited after drizzle-kit generate.
--
-- 1. warehouse_section.shipment_id: text → uuid (stays nullable since 0015), only while it is
--    still text. A row whose id is not a uuid can't belong to any shipment: its id is cleared;
--    a row that no position owns (task_id null) is then an orphan and is soft-deleted (kept,
--    with its data); a row owned by a position stays live.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'warehouse_section'
      AND column_name = 'shipment_id' AND data_type = 'text'
  ) THEN
    UPDATE "warehouse_section"
    SET "deleted_at" = CASE WHEN "task_id" IS NULL THEN COALESCE("deleted_at", now()) ELSE "deleted_at" END,
        "shipment_id" = NULL,
        "updated_at" = now()
    WHERE "shipment_id" IS NOT NULL
      AND "shipment_id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    ALTER TABLE "warehouse_section" ALTER COLUMN "shipment_id" SET DATA TYPE uuid USING "shipment_id"::uuid;
  END IF;
END $$;--> statement-breakpoint
-- Main's one-live-row-per-shipment section index is not part of the position-based design (0015
-- replaced it with the per-position and per-shipment-without-position indexes); never recreated.
DROP INDEX IF EXISTS "warehouse_section_shipment_section_idx";--> statement-breakpoint
-- 2. warehouse_task.due_date: text ('' = none) → date (null = none), only while it is still text.
--    Text that is not a real yyyy-mm-dd date becomes null.
DO $$
DECLARE
  r record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'warehouse_task'
      AND column_name = 'due_date' AND data_type = 'text'
  ) THEN
    ALTER TABLE "warehouse_task" ALTER COLUMN "due_date" DROP DEFAULT;
    ALTER TABLE "warehouse_task" ALTER COLUMN "due_date" DROP NOT NULL;
    UPDATE "warehouse_task" SET "due_date" = NULL
    WHERE "due_date" IS NOT NULL AND trim("due_date") !~ '^\d{4}-\d{2}-\d{2}$';
    -- The form is right but the day may not exist (2026-02-31): checked one by one.
    FOR r IN SELECT "id", trim("due_date") AS d FROM "warehouse_task" WHERE "due_date" IS NOT NULL LOOP
      BEGIN
        PERFORM r.d::date;
      EXCEPTION WHEN others THEN
        UPDATE "warehouse_task" SET "due_date" = NULL WHERE "id" = r."id";
      END;
    END LOOP;
    ALTER TABLE "warehouse_task" ALTER COLUMN "due_date" SET DATA TYPE date USING trim("due_date")::date;
  END IF;
END $$;--> statement-breakpoint
-- 3. A shipment is in the warehouse at most once at a time (our 0003). A database that ran main's
--    0003 skipped ours, so the index is made here when it is missing. Main never had that rule, so
--    such a database may hold two live positions for one shipment. No position is changed
--    automatically (they are real cargo): the migration stops with a message naming the query to
--    run, and the duplicates must be resolved by hand before deploying again.
DO $$
DECLARE
  dupes integer;
BEGIN
  IF to_regclass('warehouse_task_company_shipment_unique') IS NULL THEN
    SELECT count(*) INTO dupes FROM (
      SELECT 1 FROM "warehouse_task"
      WHERE "deleted_at" IS NULL AND "shipment_id" IS NOT NULL
      GROUP BY "company_id", "shipment_id" HAVING count(*) > 1
    ) d;
    IF dupes > 0 THEN
      RAISE EXCEPTION 'warehouse 0019: % shipment(s) have more than one live warehouse position', dupes
        USING HINT = 'Find them with: SELECT company_id, shipment_id, count(*) FROM warehouse_task WHERE deleted_at IS NULL AND shipment_id IS NOT NULL GROUP BY 1,2 HAVING count(*)>1; keep one live position per shipment, then deploy again.';
    END IF;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "warehouse_task_company_shipment_unique" ON "warehouse_task" USING btree ("company_id","shipment_id") WHERE deleted_at IS NULL AND shipment_id IS NOT NULL;
