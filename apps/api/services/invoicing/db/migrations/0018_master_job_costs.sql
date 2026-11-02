CREATE TABLE "master_job_cost" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"master_job_id" uuid NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"vendor" text DEFAULT '' NOT NULL,
	"est_qty" numeric(14, 2),
	"est_amount" numeric(14, 2),
	"est_currency" text DEFAULT 'CZK' NOT NULL,
	"real_qty" numeric(14, 2),
	"real_amount" numeric(14, 2),
	"real_currency" text DEFAULT 'CZK' NOT NULL,
	"invoice_number" text DEFAULT '' NOT NULL,
	"received" boolean DEFAULT false NOT NULL,
	"split_method" text DEFAULT 'wm' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_cost" ADD COLUMN "source_master_job_ref" text;--> statement-breakpoint
CREATE INDEX "master_job_cost_company_id_idx" ON "master_job_cost" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "master_job_cost_master_job_id_idx" ON "master_job_cost" USING btree ("company_id","master_job_id");--> statement-breakpoint
CREATE INDEX "invoice_cost_master_job_ref_idx" ON "invoice_cost" USING btree ("company_id","source_master_job_ref") WHERE source_master_job_ref IS NOT NULL;