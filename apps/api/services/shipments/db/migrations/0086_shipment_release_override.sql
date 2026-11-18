-- Accounts Receivable step 7 (18 Nov 2026), the prepayment stop: a manager's release of a job on prepayment that was
-- not paid - the House BoL released, or Warehouse Released set from empty - with the reason and the invoices left to
-- pay then; checked = false when Invoicing could not be asked. Written with the release (lib/prepaymentStop). Safe to run again.
CREATE TABLE IF NOT EXISTS "shipment_release_override" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"invoices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checked" boolean NOT NULL,
	"by_user_id" uuid NOT NULL,
	"by" text DEFAULT '' NOT NULL,
	CONSTRAINT "shipment_release_override_kind_check" CHECK ("shipment_release_override"."kind" IN ('house_bol', 'warehouse_released'))
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shipment_release_override" ADD CONSTRAINT "shipment_release_override_shipment_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_release_override_company_id_idx" ON "shipment_release_override" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_release_override_shipment_idx" ON "shipment_release_override" USING btree ("shipment_id","created_at");
