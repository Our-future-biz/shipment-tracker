DROP INDEX "trucking_exception_created_at_idx";--> statement-breakpoint
DROP INDEX "trucking_exception_deleted_at_idx";--> statement-breakpoint
DROP INDEX "trucking_haulier_invoice_line_created_at_idx";--> statement-breakpoint
DROP INDEX "trucking_haulier_invoice_line_deleted_at_idx";--> statement-breakpoint
DROP INDEX "trucking_haulier_invoice_created_at_idx";--> statement-breakpoint
DROP INDEX "trucking_haulier_invoice_deleted_at_idx";--> statement-breakpoint
DROP INDEX "trucking_portal_user_created_at_idx";--> statement-breakpoint
DROP INDEX "trucking_portal_user_deleted_at_idx";--> statement-breakpoint
DROP INDEX "trucking_consignment_created_at_idx";--> statement-breakpoint
DROP INDEX "trucking_consignment_deleted_at_idx";--> statement-breakpoint
DROP INDEX "trucking_document_created_at_idx";--> statement-breakpoint
DROP INDEX "trucking_document_deleted_at_idx";--> statement-breakpoint
DROP INDEX "trucking_gate_event_created_at_idx";--> statement-breakpoint
DROP INDEX "trucking_gate_event_deleted_at_idx";--> statement-breakpoint
DROP INDEX "trucking_haulier_link_created_at_idx";--> statement-breakpoint
DROP INDEX "trucking_haulier_link_deleted_at_idx";--> statement-breakpoint
DROP INDEX "trucking_leg_created_at_idx";--> statement-breakpoint
DROP INDEX "trucking_leg_deleted_at_idx";--> statement-breakpoint
DROP INDEX "trucking_trip_created_at_idx";--> statement-breakpoint
DROP INDEX "trucking_trip_deleted_at_idx";--> statement-breakpoint
DROP INDEX "trucking_fuel_index_created_at_idx";--> statement-breakpoint
DROP INDEX "trucking_fuel_index_deleted_at_idx";--> statement-breakpoint
DROP INDEX "trucking_haulier_profile_created_at_idx";--> statement-breakpoint
DROP INDEX "trucking_haulier_profile_deleted_at_idx";--> statement-breakpoint
DROP INDEX "trucking_preferred_lane_created_at_idx";--> statement-breakpoint
DROP INDEX "trucking_preferred_lane_deleted_at_idx";--> statement-breakpoint
DROP INDEX "trucking_outbox_created_at_idx";--> statement-breakpoint
DROP INDEX "trucking_outbox_deleted_at_idx";--> statement-breakpoint
DROP INDEX "trucking_settings_created_at_idx";--> statement-breakpoint
DROP INDEX "trucking_settings_deleted_at_idx";--> statement-breakpoint
DROP INDEX "trucking_tariff_created_at_idx";--> statement-breakpoint
DROP INDEX "trucking_tariff_deleted_at_idx";--> statement-breakpoint
DROP INDEX "trucking_tariff_version_created_at_idx";--> statement-breakpoint
DROP INDEX "trucking_tariff_version_deleted_at_idx";--> statement-breakpoint
DROP INDEX "trucking_exception_company_id_idx";--> statement-breakpoint
DROP INDEX "trucking_haulier_invoice_line_company_id_idx";--> statement-breakpoint
DROP INDEX "trucking_haulier_invoice_company_id_idx";--> statement-breakpoint
DROP INDEX "trucking_internal_charge_company_id_idx";--> statement-breakpoint
DROP INDEX "trucking_portal_session_company_id_idx";--> statement-breakpoint
DROP INDEX "trucking_portal_token_company_id_idx";--> statement-breakpoint
DROP INDEX "trucking_portal_user_company_id_idx";--> statement-breakpoint
DROP INDEX "trucking_consignment_company_id_idx";--> statement-breakpoint
DROP INDEX "trucking_document_company_id_idx";--> statement-breakpoint
DROP INDEX "trucking_gate_event_company_id_idx";--> statement-breakpoint
DROP INDEX "trucking_haulier_link_company_id_idx";--> statement-breakpoint
DROP INDEX "trucking_leg_company_id_idx";--> statement-breakpoint
DROP INDEX "trucking_trip_company_id_idx";--> statement-breakpoint
DROP INDEX "trucking_fuel_index_company_id_idx";--> statement-breakpoint
DROP INDEX "trucking_haulier_profile_company_id_idx";--> statement-breakpoint
DROP INDEX "trucking_preferred_lane_company_id_idx";--> statement-breakpoint
DROP INDEX "trucking_outbox_company_id_idx";--> statement-breakpoint
DROP INDEX "trucking_settings_company_id_idx";--> statement-breakpoint
DROP INDEX "trucking_tariff_company_id_idx";--> statement-breakpoint
DROP INDEX "trucking_tariff_version_company_id_idx";--> statement-breakpoint
CREATE INDEX "trucking_exception_company_id_idx" ON "trucking_exception" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "trucking_haulier_invoice_line_company_id_idx" ON "trucking_haulier_invoice_line" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "trucking_haulier_invoice_company_id_idx" ON "trucking_haulier_invoice" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "trucking_internal_charge_company_id_idx" ON "trucking_internal_charge" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "trucking_portal_session_company_id_idx" ON "trucking_portal_session" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "trucking_portal_token_company_id_idx" ON "trucking_portal_token" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "trucking_portal_user_company_id_idx" ON "trucking_portal_user" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "trucking_consignment_company_id_idx" ON "trucking_consignment" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "trucking_document_company_id_idx" ON "trucking_document" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "trucking_gate_event_company_id_idx" ON "trucking_gate_event" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "trucking_haulier_link_company_id_idx" ON "trucking_haulier_link" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "trucking_leg_company_id_idx" ON "trucking_leg" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "trucking_trip_company_id_idx" ON "trucking_trip" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "trucking_fuel_index_company_id_idx" ON "trucking_fuel_index" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "trucking_haulier_profile_company_id_idx" ON "trucking_haulier_profile" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "trucking_preferred_lane_company_id_idx" ON "trucking_preferred_lane" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "trucking_outbox_company_id_idx" ON "trucking_outbox" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "trucking_settings_company_id_idx" ON "trucking_settings" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "trucking_tariff_company_id_idx" ON "trucking_tariff" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "trucking_tariff_version_company_id_idx" ON "trucking_tariff_version" USING btree ("company_id","created_at");