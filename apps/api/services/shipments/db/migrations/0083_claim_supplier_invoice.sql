ALTER TABLE "shipment_claim" ADD COLUMN IF NOT EXISTS "supplier_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "shipment_claim" ADD COLUMN IF NOT EXISTS "claim_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "shipment_claim" ADD COLUMN IF NOT EXISTS "claim_currency" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_claim" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_claim" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipment_claim" ADD COLUMN IF NOT EXISTS "closed_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_claim_supplier_invoice_idx" ON "shipment_claim" USING btree ("company_id","supplier_invoice_id") WHERE supplier_invoice_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shipment_claim" ADD CONSTRAINT "shipment_claim_status_check" CHECK ("shipment_claim"."status" IN ('open', 'accepted', 'rejected', 'withdrawn'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
