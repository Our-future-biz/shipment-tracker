CREATE TABLE "billing_override" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"shipment_id" uuid NOT NULL,
	"row_key" text NOT NULL,
	"billing_amount" numeric(14, 2)
);
--> statement-breakpoint
CREATE TABLE "billing_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"shipment_id" uuid NOT NULL,
	"billing_currency" text DEFAULT 'CZK' NOT NULL,
	"roe" numeric(14, 6) DEFAULT '1' NOT NULL,
	"quote_ref" text DEFAULT '' NOT NULL,
	CONSTRAINT "billing_settings_shipment_id_unique" UNIQUE("shipment_id")
);
--> statement-breakpoint
CREATE TABLE "generated_invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"shipment_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"invoice_type" text NOT NULL,
	"billing_currency" text NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	CONSTRAINT "generated_invoice_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "invoice_additional_charge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"shipment_id" uuid NOT NULL,
	"invoice_number" text DEFAULT '' NOT NULL,
	"vendor" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"est_amount" numeric(14, 2),
	"est_currency" text DEFAULT 'CZK' NOT NULL,
	"real_amount" numeric(14, 2),
	"real_currency" text DEFAULT 'CZK' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_cost" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"shipment_id" uuid NOT NULL,
	"category" text NOT NULL,
	"est_amount" numeric(14, 2),
	"est_currency" text DEFAULT 'CZK' NOT NULL,
	"real_amount" numeric(14, 2),
	"real_currency" text DEFAULT 'CZK' NOT NULL,
	"invoice_number" text DEFAULT '' NOT NULL,
	"vendor" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "billing_override_created_at_idx" ON "billing_override" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "billing_override_deleted_at_idx" ON "billing_override" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "billing_override_shipment_id_idx" ON "billing_override" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "billing_settings_created_at_idx" ON "billing_settings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "billing_settings_deleted_at_idx" ON "billing_settings" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "billing_settings_shipment_id_idx" ON "billing_settings" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "generated_invoice_created_at_idx" ON "generated_invoice" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "generated_invoice_deleted_at_idx" ON "generated_invoice" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "generated_invoice_shipment_id_idx" ON "generated_invoice" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "generated_invoice_invoice_number_idx" ON "generated_invoice" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "invoice_additional_charge_created_at_idx" ON "invoice_additional_charge" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "invoice_additional_charge_deleted_at_idx" ON "invoice_additional_charge" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "invoice_additional_charge_shipment_id_idx" ON "invoice_additional_charge" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "invoice_cost_created_at_idx" ON "invoice_cost" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "invoice_cost_deleted_at_idx" ON "invoice_cost" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "invoice_cost_shipment_id_idx" ON "invoice_cost" USING btree ("shipment_id");