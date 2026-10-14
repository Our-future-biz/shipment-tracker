CREATE TABLE "invoice_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"description" text NOT NULL,
	"qty" numeric(14, 2) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"unit_currency" text NOT NULL,
	"net" numeric(14, 2) NOT NULL,
	"vat_code" text NOT NULL,
	"vat_rate" numeric(5, 2) NOT NULL,
	"source_selling_cost_id" uuid
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"kind" text DEFAULT 'invoice' NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"number" text NOT NULL,
	"corrects_invoice_id" uuid,
	"credit_reason" text DEFAULT '' NOT NULL,
	"customer_id" uuid NOT NULL,
	"issue_date" date NOT NULL,
	"duzp" date NOT NULL,
	"due_date" date NOT NULL,
	"currency" text NOT NULL,
	"fx_rate" numeric(14, 6) NOT NULL,
	"fx_week" text DEFAULT '' NOT NULL,
	"net" numeric(14, 2) NOT NULL,
	"vat" numeric(14, 2) NOT NULL,
	"gross" numeric(14, 2) NOT NULL,
	"net_czk" numeric(14, 2) NOT NULL,
	"vat_czk" numeric(14, 2) NOT NULL,
	"gross_czk" numeric(14, 2) NOT NULL,
	"vat_summary" jsonb NOT NULL,
	"supplier" jsonb NOT NULL,
	"customer" jsonb NOT NULL,
	"shipment" jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"issued_by" uuid NOT NULL,
	"idempotency_key" text,
	"pdf_key" text DEFAULT '' NOT NULL,
	"pdf_sha256" text DEFAULT '' NOT NULL,
	CONSTRAINT "invoice_kind_check" CHECK ("invoice"."kind" IN ('invoice', 'credit_note')),
	CONSTRAINT "invoice_status_check" CHECK ("invoice"."status" IN ('issued', 'credited'))
);
--> statement-breakpoint
ALTER TABLE "invoice_selling_cost" ADD COLUMN "vat_code" text;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_line_created_at_idx" ON "invoice_line" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "invoice_line_deleted_at_idx" ON "invoice_line" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "invoice_line_company_id_idx" ON "invoice_line" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "invoice_line_invoice_id_idx" ON "invoice_line" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_created_at_idx" ON "invoice" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "invoice_deleted_at_idx" ON "invoice" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "invoice_company_id_idx" ON "invoice" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "invoice_shipment_id_idx" ON "invoice" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "invoice_customer_id_idx" ON "invoice" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_company_number_unique" ON "invoice" USING btree ("company_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_company_idempotency_unique" ON "invoice" USING btree ("company_id","idempotency_key");