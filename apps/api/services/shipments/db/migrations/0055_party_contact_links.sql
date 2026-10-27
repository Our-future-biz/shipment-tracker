ALTER TABLE "shipment" ADD COLUMN "customer_pic_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "shipper_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "consignee_contact_id" uuid;--> statement-breakpoint
CREATE INDEX "master_job_shipper_id_idx" ON "master_job" USING btree ("company_id","shipper_id");--> statement-breakpoint
CREATE INDEX "master_job_consignee_id_idx" ON "master_job" USING btree ("company_id","consignee_id");--> statement-breakpoint
CREATE INDEX "shipment_shipper_id_idx" ON "shipment" USING btree ("company_id","shipper_id");--> statement-breakpoint
CREATE INDEX "shipment_consignee_id_idx" ON "shipment" USING btree ("company_id","consignee_id");--> statement-breakpoint
CREATE INDEX "shipment_principal_party_id_idx" ON "shipment" USING btree ("company_id","principal_party_id");--> statement-breakpoint
CREATE INDEX "shipment_customer_pic_contact_id_idx" ON "shipment" USING btree ("company_id","customer_pic_contact_id");--> statement-breakpoint
CREATE INDEX "shipment_shipper_contact_id_idx" ON "shipment" USING btree ("company_id","shipper_contact_id");--> statement-breakpoint
CREATE INDEX "shipment_consignee_contact_id_idx" ON "shipment" USING btree ("company_id","consignee_contact_id");