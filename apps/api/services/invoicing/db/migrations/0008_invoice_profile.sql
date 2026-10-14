CREATE TABLE "invoice_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"company_name" text DEFAULT '' NOT NULL,
	"street" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"postal_code" text DEFAULT '' NOT NULL,
	"country" text DEFAULT 'CZ' NOT NULL,
	"ico" text DEFAULT '' NOT NULL,
	"dic" text DEFAULT '' NOT NULL,
	"vat_payer" boolean DEFAULT true NOT NULL,
	"register_entry" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"web" text DEFAULT '' NOT NULL,
	"logo_data" text DEFAULT '' NOT NULL,
	"bank_accounts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_due_days" integer DEFAULT 14 NOT NULL,
	"footer_note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "invoice_profile_created_at_idx" ON "invoice_profile" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "invoice_profile_deleted_at_idx" ON "invoice_profile" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "invoice_profile_company_id_idx" ON "invoice_profile" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_profile_company_unique" ON "invoice_profile" USING btree ("company_id");