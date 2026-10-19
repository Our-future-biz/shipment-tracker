DROP INDEX "warehouse_section_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_section_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_task_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_task_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_section_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_task_company_id_idx";--> statement-breakpoint
CREATE INDEX "warehouse_section_company_id_idx" ON "warehouse_section" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_task_company_id_idx" ON "warehouse_task" USING btree ("company_id","created_at");