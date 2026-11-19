-- Mock test council m5 (19 Nov 2026): the daily reminder run skips a company that reads bank statements but read none
-- since the previous working day (P11) - silently until now. The last day it skipped, and the day of the last statement
-- read then, are kept on the company's reminder settings so the settings page can say so. The run writes nothing else on
-- such a day, and no other table can hold it (the mail log and the receivable events are per invoice).
-- Safe twice and on data: the columns are added only when missing, empty (no skip known before this).
ALTER TABLE "receivable_settings" ADD COLUMN IF NOT EXISTS "reminders_skipped_on" date;--> statement-breakpoint
ALTER TABLE "receivable_settings" ADD COLUMN IF NOT EXISTS "reminders_skipped_since" date;--> statement-breakpoint
-- Round-4 review: the invoices that billed a selling row are looked up by it (receivable ISSUED_AGAIN_FROM, the Money
-- tab's credits owed) - indexed, as invoice lines grow with every invoice and credit note.
CREATE INDEX IF NOT EXISTS "invoice_line_source_selling_cost_idx" ON "invoice_line" USING btree ("company_id","source_selling_cost_id");
