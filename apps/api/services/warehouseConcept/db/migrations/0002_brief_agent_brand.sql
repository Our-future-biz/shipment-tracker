-- Tenancy rollout: warehouse rows predate company_id. On disposable dev/staging data we
-- clear both tables so the NOT NULL company_id columns can be added; warehouse tasks and
-- section state are re-created per company.
DELETE FROM "warehouse_section";--> statement-breakpoint
DELETE FROM "warehouse_task";--> statement-breakpoint
ALTER TABLE "warehouse_task" DROP CONSTRAINT "warehouse_task_task_id_unique";--> statement-breakpoint
DROP INDEX "warehouse_task_task_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_section_shipment_section_idx";--> statement-breakpoint
ALTER TABLE "warehouse_section" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_task" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
CREATE INDEX "warehouse_section_company_id_idx" ON "warehouse_section" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "warehouse_task_company_id_idx" ON "warehouse_task" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_task_company_task_id_unique" ON "warehouse_task" USING btree ("company_id","task_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_section_shipment_section_idx" ON "warehouse_section" USING btree ("company_id","shipment_id","section");