ALTER TABLE "master_job" ADD COLUMN "vgm_closing" date;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "si_closing" date;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "release_reference" text DEFAULT '' NOT NULL;