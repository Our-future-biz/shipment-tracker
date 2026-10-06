-- Doplneni poli z HTML mockupu:
--  1) Key Dates: VGM Closing a SI Closing
--  2) Equipment & Depot: reference a depa pro vydej a vraceni kontejneru
ALTER TABLE "shipment" ADD COLUMN "vgm_closing" date;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "si_closing" date;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "release_reference" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "release_depot" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "redelivery_reference" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "redelivery_depot" text DEFAULT '' NOT NULL;
