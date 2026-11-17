-- Accounts Payable (Council Outlay 9, 17 Nov 2026): the supplier invoice, one per supplier and number, that a
-- job's cost lines and a master job's lines point to; its history; and which booked invoices a user has seen.
-- Older lines are gathered into records by the app (repositories/supplierInvoice.repository sync), not here. Safe to run again.
CREATE TABLE IF NOT EXISTS "supplier_invoice_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"action" text NOT NULL,
	"from_status" text DEFAULT '' NOT NULL,
	"to_status" text DEFAULT '' NOT NULL,
	"by_user_id" uuid,
	"by" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_invoice_seen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"supplier_key" text NOT NULL,
	"supplier_customer_id" uuid,
	"haulier_id" uuid,
	"vendor" text DEFAULT '' NOT NULL,
	"invoice_number" text NOT NULL,
	"number_key" text NOT NULL,
	"kind" text DEFAULT 'invoice' NOT NULL,
	"issue_date" date,
	"due_date" date,
	"received_at" timestamp with time zone,
	"currency" text DEFAULT '' NOT NULL,
	"total_net" numeric(14, 2),
	"vat_amount" numeric(14, 2),
	"total_gross" numeric(14, 2),
	"status" text DEFAULT 'booked' NOT NULL,
	"decided_by_user_id" uuid,
	"decided_by" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone,
	"decision_reason" text DEFAULT '' NOT NULL,
	"self_decision" boolean DEFAULT false NOT NULL,
	"paid_on" date,
	"paid_at" timestamp with time zone,
	"paid_by_user_id" uuid,
	"paid_by" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'typed' NOT NULL,
	"document_shipment_id" uuid,
	"document_attachment_id" uuid,
	"document_name" text DEFAULT '' NOT NULL,
	"entered_by_user_id" uuid,
	"entered_by" text DEFAULT '' NOT NULL,
	"refused_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "supplier_invoice_status_check" CHECK ("supplier_invoice"."status" IN ('booked', 'approved', 'refused')),
	CONSTRAINT "supplier_invoice_kind_check" CHECK ("supplier_invoice"."kind" IN ('invoice', 'credit_note')),
	CONSTRAINT "supplier_invoice_source_check" CHECK ("supplier_invoice"."source" IN ('reading', 'typed', 'master_job', 'backfill')),
	CONSTRAINT "supplier_invoice_paid_check" CHECK ("supplier_invoice"."paid_on" IS NULL OR "supplier_invoice"."status" = 'approved'),
	CONSTRAINT "supplier_invoice_refused_check" CHECK ("supplier_invoice"."status" <> 'refused' OR "supplier_invoice"."decision_reason" <> '')
);
--> statement-breakpoint
ALTER TABLE "invoice_cost" ADD COLUMN IF NOT EXISTS "supplier_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "master_job_cost" ADD COLUMN IF NOT EXISTS "supplier_invoice_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoice_event" ADD CONSTRAINT "supplier_invoice_event_invoice_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."supplier_invoice"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoice_seen" ADD CONSTRAINT "supplier_invoice_seen_invoice_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."supplier_invoice"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_invoice_event_company_id_idx" ON "supplier_invoice_event" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_invoice_event_invoice_idx" ON "supplier_invoice_event" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_invoice_seen_company_id_idx" ON "supplier_invoice_seen" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_invoice_seen_user_invoice_unique" ON "supplier_invoice_seen" USING btree ("company_id","user_id","invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_invoice_company_id_idx" ON "supplier_invoice" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_invoice_supplier_number_unique" ON "supplier_invoice" USING btree ("company_id","supplier_key","number_key") WHERE deleted_at IS NULL AND status <> 'refused';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_invoice_status_idx" ON "supplier_invoice" USING btree ("company_id","status","due_date") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_invoice_supplier_idx" ON "supplier_invoice" USING btree ("company_id","supplier_customer_id") WHERE deleted_at IS NULL AND supplier_customer_id IS NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invoice_cost" ADD CONSTRAINT "invoice_cost_supplier_invoice_fk" FOREIGN KEY ("supplier_invoice_id") REFERENCES "public"."supplier_invoice"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "master_job_cost" ADD CONSTRAINT "master_job_cost_supplier_invoice_fk" FOREIGN KEY ("supplier_invoice_id") REFERENCES "public"."supplier_invoice"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_cost_supplier_invoice_idx" ON "invoice_cost" USING btree ("supplier_invoice_id") WHERE supplier_invoice_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "master_job_cost_supplier_invoice_idx" ON "master_job_cost" USING btree ("supplier_invoice_id") WHERE supplier_invoice_id IS NOT NULL;