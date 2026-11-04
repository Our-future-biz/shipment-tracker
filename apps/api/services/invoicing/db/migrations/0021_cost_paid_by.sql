-- Who noted that a buying cost was paid, and when (Council Review 5, K6); a cost is paid only once its invoice
-- was received, now also checked by the database (m9); and the indexes What we owe reads a supplier's open
-- lines by (m4). A line paid but not received could only come from two changes at once: its paid day is taken
-- back so the check can be added. Safe to run again.
ALTER TABLE "invoice_cost" ADD COLUMN IF NOT EXISTS "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoice_cost" ADD COLUMN IF NOT EXISTS "paid_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_cost" ADD COLUMN IF NOT EXISTS "paid_by" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_cost_supplier_open_idx" ON "invoice_cost" USING btree ("company_id","supplier_customer_id") WHERE deleted_at IS NULL AND paid_on IS NULL AND supplier_customer_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_cost_haulier_open_idx" ON "invoice_cost" USING btree ("company_id","haulier_id") WHERE deleted_at IS NULL AND paid_on IS NULL AND haulier_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_cost_unlinked_open_idx" ON "invoice_cost" USING btree ("company_id","vendor") WHERE deleted_at IS NULL AND paid_on IS NULL AND supplier_customer_id IS NULL AND haulier_id IS NULL;--> statement-breakpoint
UPDATE "invoice_cost" SET "paid_on" = NULL WHERE "paid_on" IS NOT NULL AND NOT "received";--> statement-breakpoint
ALTER TABLE "invoice_cost" DROP CONSTRAINT IF EXISTS "invoice_cost_paid_check";--> statement-breakpoint
ALTER TABLE "invoice_cost" ADD CONSTRAINT "invoice_cost_paid_check" CHECK ("invoice_cost"."paid_on" IS NULL OR "invoice_cost"."received");
