CREATE TABLE IF NOT EXISTS "shipment_customer_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_by_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" uuid,
	"last_opened_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "shipment_claim" ADD COLUMN IF NOT EXISTS "notice_date" date;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shipment_customer_link" ADD CONSTRAINT "shipment_customer_link_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_customer_link_company_id_idx" ON "shipment_customer_link" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_customer_link_shipment_idx" ON "shipment_customer_link" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shipment_customer_link_token_uq" ON "shipment_customer_link" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shipment_customer_link_live_uq" ON "shipment_customer_link" USING btree ("shipment_id") WHERE revoked_at IS NULL AND deleted_at IS NULL;