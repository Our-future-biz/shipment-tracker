-- Accounts Receivable step 7 (Council Outlay 10): the language a customer is written to in - its reminders and
-- statements. Czech or English for now (German later); every customer starts in English. Safe to run again.
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customer" ADD CONSTRAINT "customer_language_check" CHECK ("customer"."language" IN ('cs', 'en'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
