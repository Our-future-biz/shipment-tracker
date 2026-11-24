-- Co-Loading Concept: a sailing's checklist (ticks with who and when), its hand-over note, and the
-- company's own checklist steps for import and for export. Council Outlay 14, C5.
-- Safe to run again: the local databases are shared by every branch.
CREATE TABLE IF NOT EXISTS "co_loading_sailing_check" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"sailing_id" uuid NOT NULL,
	"step" text NOT NULL,
	"done_by_id" uuid,
	"done_by_name" text DEFAULT '' NOT NULL,
	"done_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "co_loading_sailing" ADD COLUMN IF NOT EXISTS "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "co_loading_sailing" ADD COLUMN IF NOT EXISTS "note_by_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "co_loading_sailing" ADD COLUMN IF NOT EXISTS "note_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "co_loading_setting" ADD COLUMN IF NOT EXISTS "checklist_import" jsonb;--> statement-breakpoint
ALTER TABLE "co_loading_setting" ADD COLUMN IF NOT EXISTS "checklist_export" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "co_loading_sailing_check_company_id_idx" ON "co_loading_sailing_check" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "co_loading_sailing_check_one_per_step" ON "co_loading_sailing_check" USING btree ("company_id","sailing_id","step");
