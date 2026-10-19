DROP INDEX "contact_created_at_idx";--> statement-breakpoint
DROP INDEX "contact_deleted_at_idx";--> statement-breakpoint
DROP INDEX "customer_created_at_idx";--> statement-breakpoint
DROP INDEX "customer_deleted_at_idx";--> statement-breakpoint
DROP INDEX "customer_address_created_at_idx";--> statement-breakpoint
DROP INDEX "customer_address_deleted_at_idx";--> statement-breakpoint
DROP INDEX "customer_document_created_at_idx";--> statement-breakpoint
DROP INDEX "customer_document_deleted_at_idx";--> statement-breakpoint
DROP INDEX "customer_invoice_created_at_idx";--> statement-breakpoint
DROP INDEX "customer_invoice_deleted_at_idx";--> statement-breakpoint
DROP INDEX "customer_list_pref_created_at_idx";--> statement-breakpoint
DROP INDEX "customer_list_pref_deleted_at_idx";--> statement-breakpoint
DROP INDEX "customer_note_created_at_idx";--> statement-breakpoint
DROP INDEX "customer_note_deleted_at_idx";--> statement-breakpoint
DROP INDEX "customer_site_created_at_idx";--> statement-breakpoint
DROP INDEX "customer_site_deleted_at_idx";--> statement-breakpoint
DROP INDEX "contact_company_id_idx";--> statement-breakpoint
DROP INDEX "customer_company_id_idx";--> statement-breakpoint
DROP INDEX "customer_address_company_id_idx";--> statement-breakpoint
DROP INDEX "customer_document_company_id_idx";--> statement-breakpoint
DROP INDEX "customer_invoice_company_id_idx";--> statement-breakpoint
DROP INDEX "customer_list_pref_company_id_idx";--> statement-breakpoint
DROP INDEX "customer_note_company_id_idx";--> statement-breakpoint
DROP INDEX "customer_site_company_id_idx";--> statement-breakpoint
CREATE INDEX "contact_company_id_idx" ON "contact" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_company_id_idx" ON "customer" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_address_company_id_idx" ON "customer_address" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_document_company_id_idx" ON "customer_document" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_invoice_company_id_idx" ON "customer_invoice" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_list_pref_company_id_idx" ON "customer_list_pref" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_note_company_id_idx" ON "customer_note" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_site_company_id_idx" ON "customer_site" USING btree ("company_id","created_at");