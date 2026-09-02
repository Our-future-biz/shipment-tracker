-- Costs Breakdown dle HTML mockupu:
--  1) invoice_cost (Buying costs) dostava Qty pro Estimated i Real,
--     priznak "Received" (prijata faktura obdrzena) a poradi radku.
--  2) nova tabulka invoice_selling_cost (Selling costs).
ALTER TABLE "invoice_cost" ADD COLUMN "est_qty" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "invoice_cost" ADD COLUMN "real_qty" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "invoice_cost" ADD COLUMN "received" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_cost" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE "invoice_selling_cost" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"customer" text DEFAULT '' NOT NULL,
	"qty" numeric(14, 2),
	"amount" numeric(14, 2),
	"currency" text DEFAULT 'CZK' NOT NULL,
	"invoice" boolean DEFAULT true NOT NULL,
	"source_buy_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
CREATE INDEX "invoice_selling_cost_created_at_idx" ON "invoice_selling_cost" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "invoice_selling_cost_deleted_at_idx" ON "invoice_selling_cost" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "invoice_selling_cost_company_id_idx" ON "invoice_selling_cost" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "invoice_selling_cost_shipment_id_idx" ON "invoice_selling_cost" USING btree ("shipment_id");
