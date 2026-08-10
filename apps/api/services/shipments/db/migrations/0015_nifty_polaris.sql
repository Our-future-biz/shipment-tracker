-- Tenancy rollout: shipment rows predate company_id with no company to backfill to.
-- On disposable dev/staging data we clear the shipment tables first so the NOT NULL
-- company_id columns can be added; sample shipments are re-created by scripts/seed.ts.
DELETE FROM "shipment_task";--> statement-breakpoint
DELETE FROM "shipment_comment";--> statement-breakpoint
DELETE FROM "shipment_audit";--> statement-breakpoint
DELETE FROM "shipment_attachment";--> statement-breakpoint
DELETE FROM "container";--> statement-breakpoint
DELETE FROM "master_job";--> statement-breakpoint
DELETE FROM "shipment";--> statement-breakpoint
ALTER TABLE "master_job" DROP CONSTRAINT "master_job_mcz_number_unique";--> statement-breakpoint
ALTER TABLE "shipment" DROP CONSTRAINT "shipment_job_number_unique";--> statement-breakpoint
DROP INDEX "master_job_mcz_number_idx";--> statement-breakpoint
DROP INDEX "shipment_job_number_idx";--> statement-breakpoint
ALTER TABLE "container" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_attachment" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_audit" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_comment" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_task" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
CREATE INDEX "container_company_id_idx" ON "container" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "master_job_company_id_idx" ON "master_job" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "master_job_company_mcz_unique" ON "master_job" USING btree ("company_id","mcz_number") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "shipment_company_id_idx" ON "shipment" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_company_job_number_unique" ON "shipment" USING btree ("company_id","job_number") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "shipment_status_idx" ON "shipment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shipment_attachment_company_id_idx" ON "shipment_attachment" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "shipment_audit_company_id_idx" ON "shipment_audit" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "shipment_comment_company_id_idx" ON "shipment_comment" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "shipment_task_company_id_idx" ON "shipment_task" USING btree ("company_id");