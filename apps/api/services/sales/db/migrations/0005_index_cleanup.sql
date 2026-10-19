DROP INDEX "followup_task_created_at_idx";--> statement-breakpoint
DROP INDEX "followup_task_deleted_at_idx";--> statement-breakpoint
DROP INDEX "sales_preference_created_at_idx";--> statement-breakpoint
DROP INDEX "sales_preference_deleted_at_idx";--> statement-breakpoint
DROP INDEX "terms_condition_created_at_idx";--> statement-breakpoint
DROP INDEX "terms_condition_deleted_at_idx";--> statement-breakpoint
DROP INDEX "followup_task_company_id_idx";--> statement-breakpoint
DROP INDEX "sales_preference_company_id_idx";--> statement-breakpoint
DROP INDEX "terms_condition_company_id_idx";--> statement-breakpoint
CREATE INDEX "followup_task_company_id_idx" ON "followup_task" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "sales_preference_company_id_idx" ON "sales_preference" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "terms_condition_company_id_idx" ON "terms_condition" USING btree ("company_id","created_at");