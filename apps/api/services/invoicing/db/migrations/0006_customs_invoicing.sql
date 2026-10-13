CREATE TABLE "customs_invoice_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"currency" text DEFAULT 'CZK' NOT NULL,
	"value" numeric(14, 2),
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customs_invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"issued_invoice_number" text DEFAULT '' NOT NULL,
	CONSTRAINT "customs_invoice_shipment_id_unique" UNIQUE("shipment_id")
);
--> statement-breakpoint
CREATE INDEX "customs_invoice_line_created_at_idx" ON "customs_invoice_line" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "customs_invoice_line_deleted_at_idx" ON "customs_invoice_line" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "customs_invoice_line_company_id_idx" ON "customs_invoice_line" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "customs_invoice_line_shipment_id_idx" ON "customs_invoice_line" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "customs_invoice_created_at_idx" ON "customs_invoice" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "customs_invoice_deleted_at_idx" ON "customs_invoice" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "customs_invoice_company_id_idx" ON "customs_invoice" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "customs_invoice_shipment_id_idx" ON "customs_invoice" USING btree ("shipment_id");