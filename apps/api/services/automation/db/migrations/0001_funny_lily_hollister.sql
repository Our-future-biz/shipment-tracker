-- Tenancy rollout: automation_log is an append-only log with no company to backfill to.
-- On disposable dev/staging data we clear it so the NOT NULL company_id column can be added.
DELETE FROM "automation_log";--> statement-breakpoint
ALTER TABLE "automation_log" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
CREATE INDEX "automation_log_company_id_idx" ON "automation_log" USING btree ("company_id");