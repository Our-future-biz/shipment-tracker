-- Customer addresses: one address can be several types at once (often all of them: the seat,
-- invoices, paperwork, pick-up and delivery), so "type" becomes the list "types". Every address
-- keeps the type it had; a customer still has at most one live Registered address.
ALTER TABLE "customer_address" ADD COLUMN "types" text[];--> statement-breakpoint
UPDATE "customer_address" SET "types" = ARRAY["type"];--> statement-breakpoint
ALTER TABLE "customer_address" ALTER COLUMN "types" SET NOT NULL;--> statement-breakpoint
DROP INDEX "customer_address_one_registered";--> statement-breakpoint
ALTER TABLE "customer_address" DROP CONSTRAINT "customer_address_type_check";--> statement-breakpoint
ALTER TABLE "customer_address" DROP COLUMN "type";--> statement-breakpoint
CREATE UNIQUE INDEX "customer_address_one_registered" ON "customer_address" USING btree ("customer_id") WHERE 'Registered' = ANY("customer_address"."types") AND "customer_address"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "customer_address" ADD CONSTRAINT "customer_address_types_check" CHECK (cardinality("customer_address"."types") > 0 AND "customer_address"."types" <@ ARRAY['Registered', 'Billing', 'Paperwork', 'Pickup', 'Delivery', 'Warehouse']::text[]);
