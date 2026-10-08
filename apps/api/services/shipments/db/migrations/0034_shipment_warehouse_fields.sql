ALTER TABLE "shipment" ADD COLUMN "warehouse_received_date" date;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "warehouse_released_date" date;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "warehouse_reference" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "warehouse_truck" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "plate_number" text DEFAULT '' NOT NULL;