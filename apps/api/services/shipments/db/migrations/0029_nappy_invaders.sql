CREATE TABLE "shipment_claim" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"cargo_state" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"supplier" text DEFAULT '' NOT NULL,
	"invoice_number" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"amount" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "shipment_claim_created_at_idx" ON "shipment_claim" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "shipment_claim_deleted_at_idx" ON "shipment_claim" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "shipment_claim_company_id_idx" ON "shipment_claim" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "shipment_claim_shipment_id_idx" ON "shipment_claim" USING btree ("shipment_id");