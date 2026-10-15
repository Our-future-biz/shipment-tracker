CREATE TABLE "shipment_ref_counter" (
	"company_id" uuid NOT NULL,
	"sequence" text NOT NULL,
	"last" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_ref_counter_company_id_sequence_pk" PRIMARY KEY("company_id","sequence"),
	CONSTRAINT "shipment_ref_counter_sequence_check" CHECK ("shipment_ref_counter"."sequence" IN ('CZ', 'MCZ'))
);
--> statement-breakpoint
ALTER TABLE "cargo_dimension" ADD COLUMN "pallet_type" text;--> statement-breakpoint
ALTER TABLE "cargo_dimension" ADD COLUMN "adr_un" text;--> statement-breakpoint
ALTER TABLE "cargo_dimension" ADD COLUMN "adr_class" text;--> statement-breakpoint
ALTER TABLE "cargo_dimension" ADD COLUMN "adr_packing_group" text;--> statement-breakpoint
ALTER TABLE "cargo_dimension" ADD COLUMN "adr_limited_quantity" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "pickup_site_id" uuid;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "pickup_postcode" text;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "pickup_country" text;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "delivery_site_id" uuid;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "delivery_postcode" text;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "delivery_country" text;--> statement-breakpoint
ALTER TABLE "cargo_dimension" ADD CONSTRAINT "cargo_dimension_pallet_type_check" CHECK ("cargo_dimension"."pallet_type" IN ('EUR', 'INDUSTRIAL', 'HALF', 'QUARTER', 'OTHER'));--> statement-breakpoint
ALTER TABLE "cargo_dimension" ADD CONSTRAINT "cargo_dimension_adr_un_check" CHECK ("cargo_dimension"."adr_un" ~ '^[0-9]{4}$');--> statement-breakpoint
ALTER TABLE "cargo_dimension" ADD CONSTRAINT "cargo_dimension_adr_packing_group_check" CHECK ("cargo_dimension"."adr_packing_group" IN ('I', 'II', 'III'));--> statement-breakpoint
-- Each company's counters start at its highest number so far, archived rows included, so no
-- number is handed out twice (the counter also never falls below the stored rows later on).
INSERT INTO "shipment_ref_counter" ("company_id", "sequence", "last")
  SELECT "company_id", 'CZ', max(substring("job_number" from '^CZ([0-9]+)')::bigint)
  FROM "shipment" WHERE "job_number" ~ '^CZ[0-9]' GROUP BY "company_id";--> statement-breakpoint
INSERT INTO "shipment_ref_counter" ("company_id", "sequence", "last")
  SELECT "company_id", 'MCZ', max(substring("mcz_number" from '^MCZ([0-9]+)')::bigint)
  FROM "master_job" WHERE "mcz_number" ~ '^MCZ[0-9]' GROUP BY "company_id";