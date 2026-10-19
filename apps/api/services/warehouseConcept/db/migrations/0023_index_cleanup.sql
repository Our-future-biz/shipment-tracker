DROP INDEX "warehouse_gate_event_outbox_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_gate_event_outbox_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_gate_file_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_gate_file_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_gate_movement_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_gate_movement_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_shipment_outbox_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_shipment_outbox_deleted_at_idx";--> statement-breakpoint
DROP INDEX "wh_outbox_movement_idx";--> statement-breakpoint
DROP INDEX "warehouse_exception_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_exception_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_claim_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_claim_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_container_position_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_container_position_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_container_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_container_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_dock_slot_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_dock_slot_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_equipment_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_equipment_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_saved_report_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_saved_report_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_staff_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_staff_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_reweigh_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_reweigh_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_section_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_section_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_settings_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_settings_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_supplier_email_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_supplier_email_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_bonded_entry_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_bonded_entry_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_stock_line_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_stock_line_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_stock_movement_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_stock_movement_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_zone_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_zone_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_task_created_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_task_deleted_at_idx";--> statement-breakpoint
DROP INDEX "warehouse_gate_event_outbox_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_gate_file_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_gate_movement_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_shipment_outbox_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_exception_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_claim_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_container_position_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_container_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_dock_slot_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_equipment_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_saved_report_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_staff_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_reweigh_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_section_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_settings_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_supplier_email_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_bonded_entry_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_stock_line_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_stock_movement_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_zone_company_id_idx";--> statement-breakpoint
DROP INDEX "warehouse_task_company_id_idx";--> statement-breakpoint
CREATE INDEX "warehouse_gate_event_outbox_company_id_idx" ON "warehouse_gate_event_outbox" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_gate_file_company_id_idx" ON "warehouse_gate_file" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_gate_movement_company_id_idx" ON "warehouse_gate_movement" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_shipment_outbox_company_id_idx" ON "warehouse_shipment_outbox" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_exception_company_id_idx" ON "warehouse_exception" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_claim_company_id_idx" ON "warehouse_claim" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_container_position_company_id_idx" ON "warehouse_container_position" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_container_company_id_idx" ON "warehouse_container" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_dock_slot_company_id_idx" ON "warehouse_dock_slot" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_equipment_company_id_idx" ON "warehouse_equipment" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_saved_report_company_id_idx" ON "warehouse_saved_report" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_staff_company_id_idx" ON "warehouse_staff" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_reweigh_company_id_idx" ON "warehouse_reweigh" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_section_company_id_idx" ON "warehouse_section" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_settings_company_id_idx" ON "warehouse_settings" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_supplier_email_company_id_idx" ON "warehouse_supplier_email" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_bonded_entry_company_id_idx" ON "warehouse_bonded_entry" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_stock_line_company_id_idx" ON "warehouse_stock_line" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_stock_movement_company_id_idx" ON "warehouse_stock_movement" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_zone_company_id_idx" ON "warehouse_zone" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_task_company_id_idx" ON "warehouse_task" USING btree ("company_id","created_at");