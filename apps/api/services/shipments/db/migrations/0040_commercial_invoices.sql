CREATE TABLE "commercial_invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"invoice_number" text DEFAULT '' NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"currency" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "commercial_invoice_created_at_idx" ON "commercial_invoice" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "commercial_invoice_deleted_at_idx" ON "commercial_invoice" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "commercial_invoice_company_id_idx" ON "commercial_invoice" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "commercial_invoice_shipment_id_idx" ON "commercial_invoice" USING btree ("shipment_id");--> statement-breakpoint
-- Existing single invoice number / value become each shipment's first invoice row (currency left blank).
INSERT INTO "commercial_invoice" ("company_id", "shipment_id", "position", "invoice_number", "value", "currency")
SELECT "company_id", "id", 0, "commercial_invoice", COALESCE("commercial_invoice_value"::text, ''), ''
FROM "shipment"
WHERE "commercial_invoice" <> '' OR "commercial_invoice_value" IS NOT NULL;
