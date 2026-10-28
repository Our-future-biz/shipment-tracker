-- A company can also be a first / last mile haulier: a supplier that trucks containers between a
-- port or terminal and the customer (pre- and on-carriage), its tariffs to be kept under Tariffs.
ALTER TABLE "customer" DROP CONSTRAINT "customer_roles_check";--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_roles_check" CHECK (cardinality("customer"."roles") > 0 AND "customer"."roles" <@ ARRAY['customer', 'haulier', 'rail_operator', 'first_last_mile_haulier']::text[]);