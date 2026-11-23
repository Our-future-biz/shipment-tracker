-- Co-Loading Concept: the company's planning share of a box's inside volume, and a service's lower
-- cargo weight for its inland leg. Council Outlay 12, decisions D3 and D5.
-- Safe to run again: the local databases are shared by every branch.
CREATE TABLE IF NOT EXISTS "co_loading_setting" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"planning_volume_pct" integer NOT NULL,
	"updated_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "co_loading_setting_planning_pct_check" CHECK ("co_loading_setting"."planning_volume_pct" BETWEEN 50 AND 100)
);
--> statement-breakpoint
ALTER TABLE "co_loading_service" ADD COLUMN IF NOT EXISTS "inland_weight_kg" integer;
