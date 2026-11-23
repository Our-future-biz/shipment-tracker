-- Co-Loading Concept: a manager closes a service (its tile hidden from users, nothing new put in it) and
-- reopens it. Null closed_at while open. Safe to run again: the local databases are shared by every branch.
ALTER TABLE "co_loading_service" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "co_loading_service" ADD COLUMN IF NOT EXISTS "closed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "co_loading_service" ADD COLUMN IF NOT EXISTS "closed_by_name" text DEFAULT '' NOT NULL;
