ALTER TABLE "container" ADD COLUMN IF NOT EXISTS "free_time_days" integer;--> statement-breakpoint
ALTER TABLE "container" ADD COLUMN IF NOT EXISTS "free_time_from" text DEFAULT 'discharge' NOT NULL;--> statement-breakpoint
ALTER TABLE "container" ADD COLUMN IF NOT EXISTS "last_free_day" date;