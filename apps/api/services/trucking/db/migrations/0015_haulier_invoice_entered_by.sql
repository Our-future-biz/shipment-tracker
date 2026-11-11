ALTER TABLE "trucking_haulier_invoice" ADD COLUMN "entered_by_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
-- Invoices entered before this: who entered them is who created them (their later savers are not known).
UPDATE "trucking_haulier_invoice" SET "entered_by_user_ids" = ARRAY["created_by_user_id"] WHERE "created_by_user_id" IS NOT NULL;
