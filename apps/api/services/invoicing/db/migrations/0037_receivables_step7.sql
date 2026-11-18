-- Accounts Receivable, step 7 (Council Outlay 10, 18 Nov 2026): write-offs and bank charges confirmed by a second
-- manager (D13) and one bank payment over several invoices; the company's reminder settings and the log of what the app
-- e-mailed (automatic reminders and statements, sent only once e-mail from the app is switched on); a CAMT.053 bank
-- statement read in, its entries proposed as payments for a manager to confirm; and the exports of issued invoices and
-- credit notes to Pohoda. Safe to run again.
ALTER TABLE "receivable_payment" ADD COLUMN IF NOT EXISTS "reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "receivable_payment" ADD COLUMN IF NOT EXISTS "bank_ref" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "receivable_payment" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "receivable_payment" ADD COLUMN IF NOT EXISTS "confirmed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "receivable_payment" ADD COLUMN IF NOT EXISTS "confirmed_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "receivable_payment" ADD COLUMN IF NOT EXISTS "self_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Every line written before step 7 is a payment or a carried-over one: it counted at once, so it is confirmed.
UPDATE "receivable_payment" SET "confirmed_at" = "created_at" WHERE "confirmed_at" IS NULL AND "kind" IN ('payment', 'carried_over');--> statement-breakpoint
ALTER TABLE "receivable_payment" DROP CONSTRAINT IF EXISTS "receivable_payment_kind_check";--> statement-breakpoint
ALTER TABLE "receivable_payment" ADD CONSTRAINT "receivable_payment_kind_check" CHECK ("receivable_payment"."kind" IN ('payment', 'carried_over', 'write_off', 'bank_charge'));--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "receivable_payment" ADD CONSTRAINT "receivable_payment_reason_check" CHECK ("receivable_payment"."kind" NOT IN ('write_off', 'bank_charge') OR "receivable_payment"."reason" <> '');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "receivable_payment" ADD CONSTRAINT "receivable_payment_confirmed_check" CHECK ("receivable_payment"."kind" IN ('write_off', 'bank_charge') OR "receivable_payment"."confirmed_at" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receivable_payment_waiting_idx" ON "receivable_payment" USING btree ("company_id","created_at") WHERE confirmed_at IS NULL AND taken_back_at IS NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "receivable_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"auto_reminders" boolean DEFAULT false NOT NULL,
	"reminder1_days" smallint DEFAULT 7 NOT NULL,
	"reminder2_days" smallint DEFAULT 21 NOT NULL,
	"reply_to" text DEFAULT '' NOT NULL,
	"updated_by_user_id" uuid,
	"updated_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "receivable_settings_days_check" CHECK ("receivable_settings"."reminder1_days" BETWEEN 1 AND 365 AND "receivable_settings"."reminder2_days" > "receivable_settings"."reminder1_days" AND "receivable_settings"."reminder2_days" <= 365)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "receivable_settings_company_unique" ON "receivable_settings" USING btree ("company_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "receivable_mail" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"invoice_id" uuid,
	"customer_id" uuid NOT NULL,
	"currency" text DEFAULT '' NOT NULL,
	"reminder_level" smallint,
	"recipient" text DEFAULT '' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"status" text NOT NULL,
	"provider_id" text DEFAULT '' NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"automatic" boolean DEFAULT false NOT NULL,
	"by_user_id" uuid,
	"by" text DEFAULT '' NOT NULL,
	"idempotency_key" text,
	CONSTRAINT "receivable_mail_kind_check" CHECK ("receivable_mail"."kind" IN ('reminder', 'statement')),
	CONSTRAINT "receivable_mail_status_check" CHECK ("receivable_mail"."status" IN ('sent', 'failed'))
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "receivable_mail" ADD CONSTRAINT "receivable_mail_invoice_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receivable_mail_invoice_idx" ON "receivable_mail" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receivable_mail_customer_idx" ON "receivable_mail" USING btree ("company_id","customer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "receivable_mail_idempotency_unique" ON "receivable_mail" USING btree ("company_id","idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bank_statement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" text NOT NULL,
	"format" text DEFAULT 'camt.053' NOT NULL,
	"statement_ref" text DEFAULT '' NOT NULL,
	"account_iban" text DEFAULT '' NOT NULL,
	"currency" text DEFAULT '' NOT NULL,
	"from_date" date,
	"to_date" date,
	"entries" integer DEFAULT 0 NOT NULL,
	"imported_by_user_id" uuid,
	"imported_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bank_statement_file_unique" ON "bank_statement" USING btree ("company_id","file_sha256") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_statement_company_idx" ON "bank_statement" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bank_statement_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"statement_id" uuid NOT NULL,
	"entry_key" text NOT NULL,
	"booking_date" date,
	"value_date" date,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"credit" boolean NOT NULL,
	"variable_symbol" text DEFAULT '' NOT NULL,
	"constant_symbol" text DEFAULT '' NOT NULL,
	"specific_symbol" text DEFAULT '' NOT NULL,
	"end_to_end_id" text DEFAULT '' NOT NULL,
	"counterparty_name" text DEFAULT '' NOT NULL,
	"counterparty_account" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allocations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"decided_by" text DEFAULT '' NOT NULL,
	"decision_reason" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "bank_statement_entry_status_check" CHECK ("bank_statement_entry"."status" IN ('proposed', 'no_match', 'confirmed', 'ignored', 'not_incoming'))
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bank_statement_entry" ADD CONSTRAINT "bank_statement_entry_statement_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."bank_statement"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
-- The same bank entry read again from another (overlapping) statement file is the same entry: never noted twice.
CREATE UNIQUE INDEX IF NOT EXISTS "bank_statement_entry_key_unique" ON "bank_statement_entry" USING btree ("company_id","entry_key") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_statement_entry_statement_idx" ON "bank_statement_entry" USING btree ("statement_id","booking_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_statement_entry_open_idx" ON "bank_statement_entry" USING btree ("company_id","status") WHERE deleted_at IS NULL AND status IN ('proposed', 'no_match');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounting_export" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"system" text DEFAULT 'pohoda' NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"documents" integer DEFAULT 0 NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" text NOT NULL,
	"created_by_user_id" uuid,
	"created_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "accounting_export_system_check" CHECK ("accounting_export"."system" IN ('pohoda'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounting_export_company_idx" ON "accounting_export" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounting_export_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"export_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"system" text DEFAULT 'pohoda' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "accounting_export_document" ADD CONSTRAINT "accounting_export_document_export_fk" FOREIGN KEY ("export_id") REFERENCES "public"."accounting_export"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "accounting_export_document" ADD CONSTRAINT "accounting_export_document_invoice_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounting_export_document_invoice_idx" ON "accounting_export_document" USING btree ("company_id","system","invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounting_export_document_export_idx" ON "accounting_export_document" USING btree ("export_id");
