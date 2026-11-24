-- Co-Loading Concept: a service's default box costs for its new sailings, and its minimum earning
-- per W/M (EUR). Council Outlay 14, B4.
-- Safe to run again: the local databases are shared by every branch.
ALTER TABLE "co_loading_service" ADD COLUMN IF NOT EXISTS "default_box_costs" jsonb;--> statement-breakpoint
ALTER TABLE "co_loading_service" ADD COLUMN IF NOT EXISTS "min_earning_per_wm" numeric(14, 2);
