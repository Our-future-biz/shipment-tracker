ALTER TABLE "master_job" ADD COLUMN "hub" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "person_in_charge" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "holiday_cover" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "created_by" text DEFAULT '' NOT NULL;