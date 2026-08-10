-- Tenancy rollout: invoicing rows predate company_id. On disposable dev/staging data we
-- clear these tables so the NOT NULL company_id columns can be added; invoicing data is
-- re-created per shipment.
DELETE FROM "billing_override";--> statement-breakpoint
DELETE FROM "billing_settings";--> statement-breakpoint
DELETE FROM "generated_invoice";--> statement-breakpoint
DELETE FROM "invoice_additional_charge";--> statement-breakpoint
DELETE FROM "invoice_cost";--> statement-breakpoint
ALTER TABLE "generated_invoice" DROP CONSTRAINT "generated_invoice_invoice_number_unique";--> statement-breakpoint
DROP INDEX "generated_invoice_invoice_number_idx";--> statement-breakpoint
ALTER TABLE "billing_override" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_settings" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_invoice" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_additional_charge" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_cost" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
CREATE INDEX "billing_override_company_id_idx" ON "billing_override" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "billing_settings_company_id_idx" ON "billing_settings" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "generated_invoice_company_id_idx" ON "generated_invoice" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_invoice_company_number_unique" ON "generated_invoice" USING btree ("company_id","invoice_number");--> statement-breakpoint
CREATE INDEX "invoice_additional_charge_company_id_idx" ON "invoice_additional_charge" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "invoice_cost_company_id_idx" ON "invoice_cost" USING btree ("company_id");