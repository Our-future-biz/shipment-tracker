DROP INDEX "quote_attachment_quote_number_idx";--> statement-breakpoint
CREATE INDEX "quote_attachment_company_quote_number_idx" ON "quote_attachment" USING btree ("company_id","quote_number");