DROP INDEX "quote_created_at_idx";--> statement-breakpoint
DROP INDEX "quote_deleted_at_idx";--> statement-breakpoint
DROP INDEX "quote_attachment_created_at_idx";--> statement-breakpoint
DROP INDEX "quote_attachment_deleted_at_idx";--> statement-breakpoint
DROP INDEX "quote_ref_sequence_created_at_idx";--> statement-breakpoint
DROP INDEX "quote_ref_sequence_deleted_at_idx";--> statement-breakpoint
DROP INDEX "quote_company_id_idx";--> statement-breakpoint
DROP INDEX "quote_attachment_company_id_idx";--> statement-breakpoint
DROP INDEX "quote_ref_sequence_company_id_idx";--> statement-breakpoint
CREATE INDEX "quote_company_id_idx" ON "quote" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "quote_attachment_company_id_idx" ON "quote_attachment" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "quote_ref_sequence_company_id_idx" ON "quote_ref_sequence" USING btree ("company_id","created_at");