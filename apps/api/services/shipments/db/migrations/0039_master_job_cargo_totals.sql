ALTER TABLE "master_job" ADD COLUMN "pcs" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "type_of_packages" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "total_weight_tons" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "total_volume_cbm" text DEFAULT '' NOT NULL;