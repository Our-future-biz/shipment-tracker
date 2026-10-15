-- billing_settings: one row per shipment, unique per company instead of across all companies.
ALTER TABLE "billing_settings" DROP CONSTRAINT "billing_settings_shipment_id_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "billing_settings_company_shipment_unique" ON "billing_settings" USING btree ("company_id","shipment_id");--> statement-breakpoint
-- billing_override: one override per billing row (the upsert needs the key). Older duplicates
-- from the select-then-insert race go, the newest stays.
DELETE FROM "billing_override" o USING "billing_override" newer
  WHERE o."company_id" = newer."company_id" AND o."shipment_id" = newer."shipment_id" AND o."row_key" = newer."row_key"
    AND (o."updated_at", o."id") < (newer."updated_at", newer."id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_override_company_shipment_row_unique" ON "billing_override" USING btree ("company_id","shipment_id","row_key");--> statement-breakpoint
-- exchange_rate: valid_from / valid_to text (yyyy-mm-dd) → date. A row whose dates can't be read
-- can't be matched to any week, so it goes. One live row per week; deleted weeks can be re-entered.
DELETE FROM "exchange_rate" WHERE trim("valid_from") !~ '^\d{4}-\d{2}-\d{2}$' OR trim("valid_to") !~ '^\d{4}-\d{2}-\d{2}$';--> statement-breakpoint
ALTER TABLE "exchange_rate" ALTER COLUMN "valid_from" SET DATA TYPE date USING trim("valid_from")::date;--> statement-breakpoint
ALTER TABLE "exchange_rate" ALTER COLUMN "valid_to" SET DATA TYPE date USING trim("valid_to")::date;--> statement-breakpoint
DROP INDEX "exchange_rate_company_week_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rate_company_week_unique" ON "exchange_rate" USING btree ("company_id","week") WHERE deleted_at IS NULL;--> statement-breakpoint
-- generated_invoice.invoice_type is one of the two invoice layouts.
ALTER TABLE "generated_invoice" ADD CONSTRAINT "generated_invoice_invoice_type_check" CHECK ("generated_invoice"."invoice_type" IN ('breakdown', 'total'));
