CREATE TABLE "container" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"shipment_id" uuid NOT NULL,
	"container_number" text DEFAULT '' NOT NULL,
	"seal_number" text DEFAULT '' NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"teu" text DEFAULT '' NOT NULL,
	"packages" text DEFAULT '' NOT NULL,
	"package_type" text DEFAULT '' NOT NULL,
	"gross_weight" text DEFAULT '' NOT NULL,
	"volume" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "type_of_packages" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "service_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "invoicing_status" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "container_created_at_idx" ON "container" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "container_deleted_at_idx" ON "container" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "container_shipment_id_idx" ON "container" USING btree ("shipment_id");