-- A supplier's terms and checks (Council Outlay 7, step 6b): its payment days and currency (what we pay it), and the
-- VAT register checks before we do (unreliable payer, account published, last check, the published accounts and who
-- last added one). Edited here only; a haulier's are copied to Trucking on every save. Safe to run again.
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "supplier_payment_days" integer;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "supplier_currency" text;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "supplier_vat_unreliable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "supplier_bank_account_published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "supplier_vat_checked_at" date;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "supplier_bank_accounts" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "supplier_bank_accounts_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "supplier_bank_accounts_changed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "supplier_bank_accounts_changed_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" DROP CONSTRAINT IF EXISTS "customer_supplier_payment_days_check";--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_supplier_payment_days_check" CHECK ("customer"."supplier_payment_days" BETWEEN 0 AND 365);
