ALTER TABLE "master_job" ADD COLUMN "closing_time" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "vgm_closing_time" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "si_closing_time" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "ams_deadline" date;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "ams_deadline_time" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "isf_deadline" date;--> statement-breakpoint
ALTER TABLE "master_job" ADD COLUMN "isf_deadline_time" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "closing_time" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "vgm_closing_time" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "si_closing_time" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "ams_deadline" date;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "ams_deadline_time" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "isf_deadline" date;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "isf_deadline_time" text DEFAULT '' NOT NULL;