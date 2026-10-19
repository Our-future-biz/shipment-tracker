DROP INDEX "billing_override_created_at_idx";--> statement-breakpoint
DROP INDEX "billing_override_deleted_at_idx";--> statement-breakpoint
DROP INDEX "billing_settings_created_at_idx";--> statement-breakpoint
DROP INDEX "billing_settings_deleted_at_idx";--> statement-breakpoint
DROP INDEX "customs_invoice_line_created_at_idx";--> statement-breakpoint
DROP INDEX "customs_invoice_line_deleted_at_idx";--> statement-breakpoint
DROP INDEX "customs_invoice_created_at_idx";--> statement-breakpoint
DROP INDEX "customs_invoice_deleted_at_idx";--> statement-breakpoint
DROP INDEX "exchange_rate_created_at_idx";--> statement-breakpoint
DROP INDEX "exchange_rate_deleted_at_idx";--> statement-breakpoint
DROP INDEX "generated_invoice_created_at_idx";--> statement-breakpoint
DROP INDEX "generated_invoice_deleted_at_idx";--> statement-breakpoint
DROP INDEX "invoice_line_created_at_idx";--> statement-breakpoint
DROP INDEX "invoice_line_deleted_at_idx";--> statement-breakpoint
DROP INDEX "invoice_created_at_idx";--> statement-breakpoint
DROP INDEX "invoice_deleted_at_idx";--> statement-breakpoint
DROP INDEX "invoice_additional_charge_created_at_idx";--> statement-breakpoint
DROP INDEX "invoice_additional_charge_deleted_at_idx";--> statement-breakpoint
DROP INDEX "invoice_cost_created_at_idx";--> statement-breakpoint
DROP INDEX "invoice_cost_deleted_at_idx";--> statement-breakpoint
DROP INDEX "invoice_profile_created_at_idx";--> statement-breakpoint
DROP INDEX "invoice_profile_deleted_at_idx";--> statement-breakpoint
DROP INDEX "invoice_selling_cost_created_at_idx";--> statement-breakpoint
DROP INDEX "invoice_selling_cost_deleted_at_idx";--> statement-breakpoint
DROP INDEX "billing_override_company_id_idx";--> statement-breakpoint
DROP INDEX "billing_settings_company_id_idx";--> statement-breakpoint
DROP INDEX "customs_invoice_line_company_id_idx";--> statement-breakpoint
DROP INDEX "customs_invoice_company_id_idx";--> statement-breakpoint
DROP INDEX "exchange_rate_company_id_idx";--> statement-breakpoint
DROP INDEX "generated_invoice_company_id_idx";--> statement-breakpoint
DROP INDEX "invoice_line_company_id_idx";--> statement-breakpoint
DROP INDEX "invoice_company_id_idx";--> statement-breakpoint
DROP INDEX "invoice_additional_charge_company_id_idx";--> statement-breakpoint
DROP INDEX "invoice_cost_company_id_idx";--> statement-breakpoint
DROP INDEX "invoice_profile_company_id_idx";--> statement-breakpoint
DROP INDEX "invoice_selling_cost_company_id_idx";--> statement-breakpoint
CREATE INDEX "billing_override_company_id_idx" ON "billing_override" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_settings_company_id_idx" ON "billing_settings" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "customs_invoice_line_company_id_idx" ON "customs_invoice_line" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "customs_invoice_company_id_idx" ON "customs_invoice" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "exchange_rate_company_id_idx" ON "exchange_rate" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "generated_invoice_company_id_idx" ON "generated_invoice" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "invoice_line_company_id_idx" ON "invoice_line" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "invoice_company_id_idx" ON "invoice" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "invoice_additional_charge_company_id_idx" ON "invoice_additional_charge" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "invoice_cost_company_id_idx" ON "invoice_cost" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "invoice_profile_company_id_idx" ON "invoice_profile" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "invoice_selling_cost_company_id_idx" ON "invoice_selling_cost" USING btree ("company_id","created_at");