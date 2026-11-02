-- Up to two secondary currencies a customer may be billed in besides its default one.
-- First written as 0024 beside system-9's 0024-0026 and renumbered after them when both reached
-- main. A local database that ran it as 0024 has the column already (IF NOT EXISTS) and never ran
-- system-9's 0024, so the roles check of that one (co_loader among the roles) is made here too;
-- where it ran, this writes the same check again.
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "secondary_currencies" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" DROP CONSTRAINT IF EXISTS "customer_roles_check";--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_roles_check" CHECK (cardinality("customer"."roles") > 0 AND "customer"."roles" <@ ARRAY['customer', 'haulier', 'rail_operator', 'first_last_mile_haulier', 'shipping_line', 'co_loader']::text[]);
