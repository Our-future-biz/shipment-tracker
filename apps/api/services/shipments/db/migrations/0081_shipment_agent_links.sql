ALTER TABLE "shipment" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "agent_pic_contact_id" uuid;--> statement-breakpoint
CREATE INDEX "shipment_agent_id_idx" ON "shipment" USING btree ("company_id","agent_id");--> statement-breakpoint
CREATE INDEX "shipment_agent_pic_contact_id_idx" ON "shipment" USING btree ("company_id","agent_pic_contact_id");