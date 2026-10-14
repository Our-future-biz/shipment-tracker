-- warehouse_section.shipment_id: text → uuid, like every other shipment_id. Rows whose id isn't
-- a uuid can't belong to any shipment, so they go.
DELETE FROM "warehouse_section" WHERE "shipment_id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';--> statement-breakpoint
DROP INDEX "warehouse_section_shipment_section_idx";--> statement-breakpoint
ALTER TABLE "warehouse_section" ALTER COLUMN "shipment_id" SET DATA TYPE uuid USING "shipment_id"::uuid;--> statement-breakpoint
-- One live row per section; a deleted one no longer blocks its replacement.
CREATE UNIQUE INDEX "warehouse_section_shipment_section_idx" ON "warehouse_section" USING btree ("company_id","shipment_id","section") WHERE deleted_at IS NULL;--> statement-breakpoint
-- warehouse_task.due_date: text ('' = none) → date (null = none). Text that isn't a yyyy-mm-dd date becomes null.
ALTER TABLE "warehouse_task" ALTER COLUMN "due_date" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "warehouse_task" ALTER COLUMN "due_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_task" ALTER COLUMN "due_date" SET DATA TYPE date USING (CASE WHEN trim("due_date") ~ '^\d{4}-\d{2}-\d{2}$' THEN trim("due_date")::date END);
