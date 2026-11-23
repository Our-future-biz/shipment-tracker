-- Co-Loading Concept: shipments linked to a sailing (its box), one live sailing per shipment.
-- Safe to run again: the local databases are shared by every branch.
CREATE TABLE IF NOT EXISTS "co_loading_sailing_shipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"sailing_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"created_by_id" uuid,
	"created_by_name" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "co_loading_sailing_shipment_company_id_idx" ON "co_loading_sailing_shipment" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "co_loading_sailing_shipment_sailing_idx" ON "co_loading_sailing_shipment" USING btree ("company_id","sailing_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "co_loading_sailing_shipment_one_sailing" ON "co_loading_sailing_shipment" USING btree ("company_id","shipment_id") WHERE deleted_at IS NULL;