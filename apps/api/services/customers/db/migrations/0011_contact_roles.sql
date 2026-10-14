ALTER TABLE "contact" DROP CONSTRAINT "contact_role_check";--> statement-breakpoint
-- The old roles map onto the new ones; Sales stays Sales.
UPDATE "contact" SET "role" = 'Logistics Manager' WHERE "role" = 'Operations';--> statement-breakpoint
UPDATE "contact" SET "role" = 'Finance / Accounting' WHERE "role" = 'Finance';--> statement-breakpoint
ALTER TABLE "contact" ALTER COLUMN "role" SET DEFAULT 'Logistics Manager';--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_role_check" CHECK ("contact"."role" IN ('Purchasing / Procurement', 'Customer Service', 'Logistics Manager', 'Warehouse', 'Finance / Accounting', 'Sales', 'Management', 'Owner'));