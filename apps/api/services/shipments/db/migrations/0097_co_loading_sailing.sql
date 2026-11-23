-- Co-Loading Concept: a service's sailings (lib/coLoadingSailing), made with "Create new sailing" on its page.
-- Safe to run again: the local databases are shared by every branch.
CREATE TABLE IF NOT EXISTS "co_loading_sailing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"vessel" text NOT NULL,
	"voyage" text DEFAULT '' NOT NULL,
	"pol" text NOT NULL,
	"pod" text NOT NULL,
	"hub" text NOT NULL,
	"container_type" text NOT NULL,
	"created_by_id" uuid,
	"created_by_name" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "co_loading_sailing_company_id_idx" ON "co_loading_sailing" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "co_loading_sailing_service_idx" ON "co_loading_sailing" USING btree ("company_id","service_id","created_at");