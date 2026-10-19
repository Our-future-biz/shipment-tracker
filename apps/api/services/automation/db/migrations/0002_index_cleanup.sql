DROP INDEX "automation_log_created_at_idx";--> statement-breakpoint
DROP INDEX "automation_log_deleted_at_idx";--> statement-breakpoint
DROP INDEX "automation_log_company_id_idx";--> statement-breakpoint
CREATE INDEX "automation_log_company_id_idx" ON "automation_log" USING btree ("company_id","created_at");