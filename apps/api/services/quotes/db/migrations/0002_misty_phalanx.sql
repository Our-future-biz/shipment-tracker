-- Tenancy rollout: quote rows predate company_id with no company to backfill to. On
-- disposable dev/staging data we clear the quote tables first so the NOT NULL company_id
-- columns can be added. Quotes are re-created per company from the sales module.
DELETE FROM "quote_ref_sequence";--> statement-breakpoint
DELETE FROM "quote_attachment";--> statement-breakpoint
DELETE FROM "quote";--> statement-breakpoint
ALTER TABLE "quote" DROP CONSTRAINT "quote_quote_number_unique";--> statement-breakpoint
DROP INDEX "quote_quote_number_idx";--> statement-breakpoint
DROP INDEX "quote_ref_sequence_quote_number_idx";--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_attachment" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_ref_sequence" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
CREATE INDEX "quote_company_id_idx" ON "quote" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_company_number_unique" ON "quote" USING btree ("company_id","quote_number");--> statement-breakpoint
CREATE INDEX "quote_attachment_company_id_idx" ON "quote_attachment" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "quote_ref_sequence_company_id_idx" ON "quote_ref_sequence" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_ref_sequence_company_number_unique" ON "quote_ref_sequence" USING btree ("company_id","quote_number") WHERE deleted_at IS NULL;