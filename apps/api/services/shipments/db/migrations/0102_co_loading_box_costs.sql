-- Co-Loading Concept, Earnings: the costs of a sailing's boxes - Origin Costs, Ocean Freight and
-- Destination Costs per container, estimates set by managers - and the record of every change.
-- Council Outlay 13, decisions D4-D6 and D16.
-- Safe to run again: the local databases are shared by every branch.
CREATE TABLE IF NOT EXISTS "co_loading_box_cost_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"sailing_id" uuid NOT NULL,
	"container_no" integer NOT NULL,
	"kind" text NOT NULL,
	"old_amount" numeric(14, 2),
	"old_currency" text DEFAULT '' NOT NULL,
	"old_note" text DEFAULT '' NOT NULL,
	"new_amount" numeric(14, 2),
	"new_currency" text DEFAULT '' NOT NULL,
	"new_note" text DEFAULT '' NOT NULL,
	"changed_by_id" uuid,
	"changed_by_name" text DEFAULT '' NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "co_loading_box_cost" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"sailing_id" uuid NOT NULL,
	"container_no" integer NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(14, 2),
	"currency" text DEFAULT 'EUR' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"updated_by_id" uuid,
	"updated_by_name" text DEFAULT '' NOT NULL,
	CONSTRAINT "co_loading_box_cost_kind_check" CHECK ("co_loading_box_cost"."kind" IN ('origin', 'ocean', 'destination')),
	CONSTRAINT "co_loading_box_cost_container_check" CHECK ("co_loading_box_cost"."container_no" >= 1),
	CONSTRAINT "co_loading_box_cost_amount_check" CHECK ("co_loading_box_cost"."amount" IS NULL OR "co_loading_box_cost"."amount" >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "co_loading_box_cost_change_sailing_idx" ON "co_loading_box_cost_change" USING btree ("company_id","sailing_id","changed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "co_loading_box_cost_company_id_idx" ON "co_loading_box_cost" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "co_loading_box_cost_one_per_kind" ON "co_loading_box_cost" USING btree ("company_id","sailing_id","container_no","kind");