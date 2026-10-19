DROP INDEX "cargo_dimension_created_at_idx";--> statement-breakpoint
DROP INDEX "cargo_dimension_deleted_at_idx";--> statement-breakpoint
DROP INDEX "cargo_item_created_at_idx";--> statement-breakpoint
DROP INDEX "cargo_item_deleted_at_idx";--> statement-breakpoint
DROP INDEX "commercial_invoice_created_at_idx";--> statement-breakpoint
DROP INDEX "commercial_invoice_deleted_at_idx";--> statement-breakpoint
DROP INDEX "container_created_at_idx";--> statement-breakpoint
DROP INDEX "container_deleted_at_idx";--> statement-breakpoint
DROP INDEX "master_job_created_at_idx";--> statement-breakpoint
DROP INDEX "master_job_deleted_at_idx";--> statement-breakpoint
DROP INDEX "master_job_container_created_at_idx";--> statement-breakpoint
DROP INDEX "master_job_container_deleted_at_idx";--> statement-breakpoint
DROP INDEX "shipment_created_at_idx";--> statement-breakpoint
DROP INDEX "shipment_deleted_at_idx";--> statement-breakpoint
DROP INDEX "shipment_attachment_created_at_idx";--> statement-breakpoint
DROP INDEX "shipment_attachment_deleted_at_idx";--> statement-breakpoint
DROP INDEX "shipment_claim_created_at_idx";--> statement-breakpoint
DROP INDEX "shipment_claim_deleted_at_idx";--> statement-breakpoint
DROP INDEX "shipment_comment_created_at_idx";--> statement-breakpoint
DROP INDEX "shipment_comment_deleted_at_idx";--> statement-breakpoint
DROP INDEX "shipment_comment_read_created_at_idx";--> statement-breakpoint
DROP INDEX "shipment_comment_read_deleted_at_idx";--> statement-breakpoint
DROP INDEX "shipment_task_created_at_idx";--> statement-breakpoint
DROP INDEX "shipment_task_deleted_at_idx";--> statement-breakpoint
DROP INDEX "user_preference_created_at_idx";--> statement-breakpoint
DROP INDEX "user_preference_deleted_at_idx";--> statement-breakpoint
DROP INDEX "cargo_dimension_company_id_idx";--> statement-breakpoint
DROP INDEX "cargo_item_company_id_idx";--> statement-breakpoint
DROP INDEX "commercial_invoice_company_id_idx";--> statement-breakpoint
DROP INDEX "container_company_id_idx";--> statement-breakpoint
DROP INDEX "master_job_company_id_idx";--> statement-breakpoint
DROP INDEX "master_job_container_company_id_idx";--> statement-breakpoint
DROP INDEX "shipment_company_id_idx";--> statement-breakpoint
DROP INDEX "shipment_attachment_company_id_idx";--> statement-breakpoint
DROP INDEX "shipment_claim_company_id_idx";--> statement-breakpoint
DROP INDEX "shipment_comment_company_id_idx";--> statement-breakpoint
DROP INDEX "shipment_comment_read_company_id_idx";--> statement-breakpoint
DROP INDEX "shipment_task_company_id_idx";--> statement-breakpoint
DROP INDEX "user_preference_company_id_idx";--> statement-breakpoint
CREATE INDEX "shipment_comment_mentioned_user_ids_idx" ON "shipment_comment" USING gin ("mentioned_user_ids");--> statement-breakpoint
CREATE INDEX "cargo_dimension_company_id_idx" ON "cargo_dimension" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "cargo_item_company_id_idx" ON "cargo_item" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "commercial_invoice_company_id_idx" ON "commercial_invoice" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "container_company_id_idx" ON "container" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "master_job_company_id_idx" ON "master_job" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "master_job_container_company_id_idx" ON "master_job_container" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "shipment_company_id_idx" ON "shipment" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "shipment_attachment_company_id_idx" ON "shipment_attachment" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "shipment_claim_company_id_idx" ON "shipment_claim" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "shipment_comment_company_id_idx" ON "shipment_comment" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "shipment_comment_read_company_id_idx" ON "shipment_comment_read" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "shipment_task_company_id_idx" ON "shipment_task" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "user_preference_company_id_idx" ON "user_preference" USING btree ("company_id","created_at");