-- What we owe's open-line indexes leave out Trucking's rows and a master job's shares, as its queries do, and the
-- unlinked one no longer holds the vendor text (a long one would not fit a btree entry) (Council Review 5, C-3,
-- C-4); two indexes for the jobs a supplier is on (its page's Open jobs). Safe to run again.
DROP INDEX IF EXISTS "invoice_cost_supplier_open_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "invoice_cost_haulier_open_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "invoice_cost_unlinked_open_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_cost_supplier_used_idx" ON "invoice_cost" USING btree ("company_id","supplier_customer_id") WHERE deleted_at IS NULL AND supplier_customer_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_cost_haulier_used_idx" ON "invoice_cost" USING btree ("company_id","haulier_id") WHERE deleted_at IS NULL AND haulier_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_cost_supplier_open_idx" ON "invoice_cost" USING btree ("company_id","supplier_customer_id") WHERE deleted_at IS NULL AND paid_on IS NULL AND supplier_customer_id IS NOT NULL AND source_trucking_ref IS NULL AND source_master_job_ref IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_cost_haulier_open_idx" ON "invoice_cost" USING btree ("company_id","haulier_id") WHERE deleted_at IS NULL AND paid_on IS NULL AND haulier_id IS NOT NULL AND source_trucking_ref IS NULL AND source_master_job_ref IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_cost_unlinked_open_idx" ON "invoice_cost" USING btree ("company_id") WHERE deleted_at IS NULL AND paid_on IS NULL AND supplier_customer_id IS NULL AND haulier_id IS NULL AND source_trucking_ref IS NULL AND source_master_job_ref IS NULL;
