-- Tariffs: a company can also be a rail operator, a supplier whose rail tariffs are kept under Tariffs.
ALTER TABLE "customer" DROP CONSTRAINT "customer_roles_check";--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_roles_check" CHECK (cardinality("customer"."roles") > 0 AND "customer"."roles" <@ ARRAY['customer', 'haulier', 'rail_operator']::text[]);