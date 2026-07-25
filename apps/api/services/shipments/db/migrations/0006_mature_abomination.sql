ALTER TABLE "shipment" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
CREATE INDEX "shipment_customer_id_idx" ON "shipment" USING btree ("customer_id");