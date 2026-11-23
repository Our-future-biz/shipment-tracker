CREATE TABLE "loading_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"link_kind" text,
	"link_id" uuid,
	"link_ref" text DEFAULT '' NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nominated" jsonb,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "loading_plan_link_kind_check" CHECK ("loading_plan"."link_kind" IN ('shipment', 'quote')),
	CONSTRAINT "loading_plan_link_whole_check" CHECK (("loading_plan"."link_kind" IS NULL) = ("loading_plan"."link_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX "loading_plan_company_id_idx" ON "loading_plan" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "loading_plan_link_idx" ON "loading_plan" USING btree ("company_id","link_kind","link_id");