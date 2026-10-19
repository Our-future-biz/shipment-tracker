DROP INDEX "cnb_import_run_deleted_at_idx";--> statement-breakpoint
DROP INDEX "cnb_rate_deleted_at_idx";--> statement-breakpoint
DROP INDEX "fx_alert_deleted_at_idx";--> statement-breakpoint
DROP INDEX "job_rate_created_at_idx";--> statement-breakpoint
DROP INDEX "job_rate_deleted_at_idx";--> statement-breakpoint
DROP INDEX "roe_setting_created_at_idx";--> statement-breakpoint
DROP INDEX "roe_setting_deleted_at_idx";--> statement-breakpoint
DROP INDEX "job_rate_company_id_idx";--> statement-breakpoint
DROP INDEX "roe_setting_company_id_idx";--> statement-breakpoint
CREATE INDEX "job_rate_company_id_idx" ON "job_rate" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "roe_setting_company_id_idx" ON "roe_setting" USING btree ("company_id","created_at");