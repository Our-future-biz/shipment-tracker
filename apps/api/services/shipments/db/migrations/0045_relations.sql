-- Rows pointing at nothing would block the new foreign keys: remove or detach them first.
DELETE FROM "cargo_dimension" WHERE "shipment_id" NOT IN (SELECT "id" FROM "shipment");--> statement-breakpoint
DELETE FROM "cargo_item" WHERE "shipment_id" NOT IN (SELECT "id" FROM "shipment");--> statement-breakpoint
DELETE FROM "commercial_invoice" WHERE "shipment_id" NOT IN (SELECT "id" FROM "shipment");--> statement-breakpoint
DELETE FROM "container" WHERE "shipment_id" NOT IN (SELECT "id" FROM "shipment");--> statement-breakpoint
DELETE FROM "shipment_attachment" WHERE "shipment_id" NOT IN (SELECT "id" FROM "shipment");--> statement-breakpoint
DELETE FROM "shipment_audit" WHERE "shipment_id" NOT IN (SELECT "id" FROM "shipment");--> statement-breakpoint
DELETE FROM "shipment_claim" WHERE "shipment_id" NOT IN (SELECT "id" FROM "shipment");--> statement-breakpoint
DELETE FROM "shipment_comment" WHERE "shipment_id" NOT IN (SELECT "id" FROM "shipment");--> statement-breakpoint
DELETE FROM "shipment_comment_read" WHERE "shipment_id" NOT IN (SELECT "id" FROM "shipment");--> statement-breakpoint
DELETE FROM "shipment_task" WHERE "shipment_id" NOT IN (SELECT "id" FROM "shipment");--> statement-breakpoint
DELETE FROM "master_job_container" WHERE "master_job_id" NOT IN (SELECT "id" FROM "master_job");--> statement-breakpoint
UPDATE "cargo_dimension" SET "container_id" = NULL WHERE "container_id" IS NOT NULL AND "container_id" NOT IN (SELECT "id" FROM "container");--> statement-breakpoint
UPDATE "cargo_item" SET "container_id" = NULL WHERE "container_id" IS NOT NULL AND "container_id" NOT IN (SELECT "id" FROM "container");--> statement-breakpoint
UPDATE "shipment" SET "master_job_id" = NULL WHERE "master_job_id" IS NOT NULL AND "master_job_id" NOT IN (SELECT "id" FROM "master_job");--> statement-breakpoint
UPDATE "shipment_attachment" SET "comment_id" = NULL WHERE "comment_id" IS NOT NULL AND "comment_id" NOT IN (SELECT "id" FROM "shipment_comment");--> statement-breakpoint
-- Keep the newest live row of each task before the unique index.
DELETE FROM "shipment_task" t USING "shipment_task" newer
  WHERE t."deleted_at" IS NULL AND newer."deleted_at" IS NULL
    AND t."company_id" = newer."company_id" AND t."shipment_id" = newer."shipment_id" AND t."task_key" = newer."task_key"
    AND (t."updated_at", t."id") < (newer."updated_at", newer."id");--> statement-breakpoint
ALTER TABLE "cargo_dimension" ADD CONSTRAINT "cargo_dimension_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargo_dimension" ADD CONSTRAINT "cargo_dimension_container_id_container_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."container"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargo_item" ADD CONSTRAINT "cargo_item_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargo_item" ADD CONSTRAINT "cargo_item_container_id_container_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."container"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_invoice" ADD CONSTRAINT "commercial_invoice_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container" ADD CONSTRAINT "container_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_job_container" ADD CONSTRAINT "master_job_container_master_job_id_master_job_id_fk" FOREIGN KEY ("master_job_id") REFERENCES "public"."master_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_master_job_id_master_job_id_fk" FOREIGN KEY ("master_job_id") REFERENCES "public"."master_job"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_attachment" ADD CONSTRAINT "shipment_attachment_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_attachment" ADD CONSTRAINT "shipment_attachment_comment_id_shipment_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."shipment_comment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_audit" ADD CONSTRAINT "shipment_audit_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_claim" ADD CONSTRAINT "shipment_claim_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_comment" ADD CONSTRAINT "shipment_comment_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_comment_read" ADD CONSTRAINT "shipment_comment_read_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_task" ADD CONSTRAINT "shipment_task_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_master_job_id_idx" ON "shipment" USING btree ("master_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_task_company_shipment_key_uq" ON "shipment_task" USING btree ("company_id","shipment_id","task_key") WHERE deleted_at IS NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_customs_priority_check" CHECK ("shipment"."customs_priority" IN ('Standard', 'Urgent'));--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_cs_recv_invoice_check" CHECK ("shipment"."cs_recv_invoice" IN ('', 'yes', 'no'));--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_cs_recv_packing_check" CHECK ("shipment"."cs_recv_packing" IN ('', 'yes', 'no'));--> statement-breakpoint
ALTER TABLE "shipment_attachment" ADD CONSTRAINT "shipment_attachment_customs_status_check" CHECK ("shipment_attachment"."customs_status" IN ('', 'approved', 'declined'));--> statement-breakpoint
ALTER TABLE "shipment_claim" ADD CONSTRAINT "shipment_claim_kind_check" CHECK ("shipment_claim"."kind" IN ('cargo', 'cost'));