DROP INDEX "quote_customer_id_idx";--> statement-breakpoint
DROP INDEX "quote_owner_user_id_idx";--> statement-breakpoint
CREATE INDEX "quote_company_customer_id_idx" ON "quote" USING btree ("company_id","customer_id");--> statement-breakpoint
CREATE INDEX "quote_company_owner_user_id_idx" ON "quote" USING btree ("company_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "quote_company_linked_idx" ON "quote" USING btree ("company_id") WHERE shipment_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "quote_company_number_pattern_idx" ON "quote" USING btree ("company_id","quote_number" text_pattern_ops);--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_data_version_check" CHECK ("quote"."data_version" >= 1);