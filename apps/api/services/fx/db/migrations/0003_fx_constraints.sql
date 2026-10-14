ALTER TABLE "cnb_import_run" ADD CONSTRAINT "cnb_import_run_trigger_check" CHECK ("cnb_import_run"."trigger" IN ('startup', 'schedule', 'cron', 'manual', 'backfill'));--> statement-breakpoint
ALTER TABLE "cnb_import_run" ADD CONSTRAINT "cnb_import_run_status_check" CHECK ("cnb_import_run"."status" IN ('running', 'ok', 'no_new_data', 'failed'));--> statement-breakpoint
ALTER TABLE "cnb_rate" ADD CONSTRAINT "cnb_rate_amount_positive" CHECK ("cnb_rate"."amount" > 0);--> statement-breakpoint
ALTER TABLE "cnb_rate" ADD CONSTRAINT "cnb_rate_rate_positive" CHECK ("cnb_rate"."rate" > 0);--> statement-breakpoint
ALTER TABLE "job_rate" ADD CONSTRAINT "job_rate_basis_check" CHECK ("job_rate"."basis" IN ('ata', 'atd'));--> statement-breakpoint
ALTER TABLE "roe_setting" ADD CONSTRAINT "roe_setting_pct_check" CHECK ("roe_setting"."pct" BETWEEN 80 AND 120);