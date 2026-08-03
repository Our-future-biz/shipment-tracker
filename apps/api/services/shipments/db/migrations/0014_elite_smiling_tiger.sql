ALTER TABLE "container" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" DROP COLUMN "container_number";