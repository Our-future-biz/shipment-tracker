ALTER TABLE "invoice_cost" ADD COLUMN IF NOT EXISTS "posted_from_lines" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Credit notes posted before the column was there: their own minus rows, saying they are a credit note.
UPDATE "invoice_cost" SET "posted_from_lines" = true WHERE "posted_from_lines" = false AND "real_amount" < 0 AND "est_amount" IS NULL AND "description" LIKE 'Credit note%' AND "source_trucking_ref" IS NULL AND "source_master_job_ref" IS NULL;
