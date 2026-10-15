-- Trucking phase 0: a company can be a customer, a haulier (trucking subcontractor) or both, and
-- has structured loading / delivery sites with a postcode for zone pricing. Every existing row
-- gets the default role "customer", so nothing changes for the companies already in the database.
CREATE TABLE "customer_site" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" text NOT NULL,
	"kind" text DEFAULT 'both' NOT NULL,
	"street" text DEFAULT '' NOT NULL,
	"postcode" text NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"country" text DEFAULT 'CZ' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"opening_hours" text DEFAULT '' NOT NULL,
	"avizace_name" text DEFAULT '' NOT NULL,
	"avizace_phone" text DEFAULT '' NOT NULL,
	"avizace_email" text DEFAULT '' NOT NULL,
	"loading_notes" text DEFAULT '' NOT NULL,
	"tail_lift_needed" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "customer_site_kind_check" CHECK ("customer_site"."kind" IN ('loading', 'delivery', 'both'))
);
--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "roles" text[] DEFAULT '{customer}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_site" ADD CONSTRAINT "customer_site_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_site_created_at_idx" ON "customer_site" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "customer_site_deleted_at_idx" ON "customer_site" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "customer_site_company_id_idx" ON "customer_site" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "customer_site_customer_id_idx" ON "customer_site" USING btree ("customer_id");--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_roles_check" CHECK (cardinality("customer"."roles") > 0 AND "customer"."roles" <@ ARRAY['customer', 'haulier']::text[]);