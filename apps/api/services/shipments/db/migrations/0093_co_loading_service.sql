-- Co-Loading Concept's services (lib/coLoadingService): one row per lane customer service consolidates on.
-- Every service is made by a manager with New Service; none is made by the app or here.
-- Safe to run again: the local databases are shared by every branch.
CREATE TABLE IF NOT EXISTS "co_loading_service" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"direction" text NOT NULL,
	"mode" text NOT NULL,
	"origin" text DEFAULT '' NOT NULL,
	"destination" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by_id" uuid,
	"created_by_name" text DEFAULT '' NOT NULL,
	CONSTRAINT "co_loading_service_direction_check" CHECK ("co_loading_service"."direction" IN ('import', 'export')),
	CONSTRAINT "co_loading_service_mode_check" CHECK ("co_loading_service"."mode" IN ('sea_lcl', 'sea_fcl', 'air', 'rail', 'road'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "co_loading_service_company_id_idx" ON "co_loading_service" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "co_loading_service_name_unique" ON "co_loading_service" USING btree ("company_id",lower("name")) WHERE deleted_at IS NULL;