-- Accounts Receivable (Council Outlay 10): where an entry of the customer's invoice list came from (typed in here, or
-- posted by Invoicing, with the invoice's id), and what Finance → Accounts Receivable says is left to pay on it and
-- when it was last paid. Left to pay stays empty until Accounts Receivable sends it; the amount counts until then.
-- Older entries are marked as posted by the app when Invoicing names them, not here. Safe to run again.
ALTER TABLE "customer_invoice" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'typed' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_invoice" ADD COLUMN IF NOT EXISTS "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_invoice" ADD COLUMN IF NOT EXISTS "left_to_pay" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "customer_invoice" ADD COLUMN IF NOT EXISTS "paid_on" date;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customer_invoice" ADD CONSTRAINT "customer_invoice_source_check" CHECK ("customer_invoice"."source" IN ('typed', 'invoicing'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_invoice_invoice_id_idx" ON "customer_invoice" USING btree ("company_id","invoice_id");
