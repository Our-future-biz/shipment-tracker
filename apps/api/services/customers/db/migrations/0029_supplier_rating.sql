-- A supplier's rating: 0–5 whole stars set by hand by a manager (null = not rated), with the reason, who set it
-- and when on the customer, and every change kept in customer_supplier_rating. Safe to run again: the local
-- databases are shared by every branch.
CREATE TABLE IF NOT EXISTS "customer_supplier_rating" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"rating" smallint,
	"reason" text DEFAULT '' NOT NULL,
	"set_by" text DEFAULT '' NOT NULL,
	"set_by_user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "customer_supplier_rating" DROP CONSTRAINT IF EXISTS "customer_supplier_rating_rating_check";--> statement-breakpoint
ALTER TABLE "customer_supplier_rating" ADD CONSTRAINT "customer_supplier_rating_rating_check" CHECK ("customer_supplier_rating"."rating" BETWEEN 0 AND 5);--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "supplier_rating" smallint;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "supplier_rating_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "supplier_rating_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "supplier_rating_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "supplier_rating_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer_supplier_rating" DROP CONSTRAINT IF EXISTS "customer_supplier_rating_customer_id_customer_id_fk";--> statement-breakpoint
ALTER TABLE "customer_supplier_rating" ADD CONSTRAINT "customer_supplier_rating_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_supplier_rating_company_id_idx" ON "customer_supplier_rating" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_supplier_rating_customer_id_idx" ON "customer_supplier_rating" USING btree ("customer_id","created_at");--> statement-breakpoint
ALTER TABLE "customer" DROP CONSTRAINT IF EXISTS "customer_supplier_rating_check";--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_supplier_rating_check" CHECK ("customer"."supplier_rating" BETWEEN 0 AND 5);
