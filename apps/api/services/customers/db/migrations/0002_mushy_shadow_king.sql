-- Tenancy rollout: every customer row must belong to a company, but existing rows
-- predate company_id with nothing to backfill to. On disposable dev/staging data we
-- clear customer first (contact/note/document/invoice cascade via FK) so the NOT NULL
-- company_id column can be added. Customers are re-created per company from ARES.
DELETE FROM "customer";--> statement-breakpoint
ALTER TABLE "customer" DROP CONSTRAINT "customer_ico_unique";--> statement-breakpoint
DROP INDEX "customer_ico_idx";--> statement-breakpoint
ALTER TABLE "customer" ALTER COLUMN "credit_limit" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "customer" ALTER COLUMN "total_revenue" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "customer" ALTER COLUMN "total_profit" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "customer_invoice" ALTER COLUMN "amount" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_document" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_invoice" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_note" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
CREATE INDEX "contact_company_id_idx" ON "contact" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "customer_company_id_idx" ON "customer" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_company_ico_unique" ON "customer" USING btree ("company_id","ico") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "customer_document_company_id_idx" ON "customer_document" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "customer_invoice_company_id_idx" ON "customer_invoice" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "customer_note_company_id_idx" ON "customer_note" USING btree ("company_id");