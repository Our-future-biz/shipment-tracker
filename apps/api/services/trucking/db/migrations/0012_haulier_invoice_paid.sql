-- When an approved haulier invoice was paid, and who noted it (Council Outlay 7, step 6b): beside the status, so the
-- approval rules stay as they are; only an approved invoice can be paid. Safe to run again.
ALTER TABLE "trucking_haulier_invoice" ADD COLUMN IF NOT EXISTS "paid_on" date;--> statement-breakpoint
ALTER TABLE "trucking_haulier_invoice" ADD COLUMN IF NOT EXISTS "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trucking_haulier_invoice" ADD COLUMN IF NOT EXISTS "paid_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "trucking_haulier_invoice" ADD COLUMN IF NOT EXISTS "paid_by" text;--> statement-breakpoint
ALTER TABLE "trucking_haulier_invoice" DROP CONSTRAINT IF EXISTS "trucking_haulier_invoice_paid_check";--> statement-breakpoint
ALTER TABLE "trucking_haulier_invoice" ADD CONSTRAINT "trucking_haulier_invoice_paid_check" CHECK ("trucking_haulier_invoice"."paid_on" IS NULL OR "trucking_haulier_invoice"."status" = 'APPROVED');
