ALTER TABLE "invoice_selling_cost" ADD COLUMN IF NOT EXISTS "waived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "selling_amount_request" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'amount' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "selling_amount_request" ADD CONSTRAINT "selling_amount_request_kind_check" CHECK ("selling_amount_request"."kind" IN ('amount', 'remove'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;