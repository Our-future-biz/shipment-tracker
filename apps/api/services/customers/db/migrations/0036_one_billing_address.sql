-- One billing address per customer: the one its invoices are addressed to (printed instead of
-- the seat). Customers that have several live Billing addresses from before the rule keep the
-- oldest - the one Import Instructions already read first. The others lose the type; one that was
-- nothing but Billing becomes Paperwork, so it is kept and shown, never deleted. The addresses of a
-- deleted customer are put right the same way, by the deletion they share: restoring the customer
-- brings them back together, and two Billing addresses among them would be refused by the index.
UPDATE "customer_address" AS a
SET "types" = CASE
    WHEN a."types" = ARRAY['Billing']::text[] THEN ARRAY['Paperwork']::text[]
    ELSE array_remove(a."types", 'Billing')
  END,
  "updated_at" = now()
WHERE 'Billing' = ANY(a."types")
  AND EXISTS (
    SELECT 1 FROM "customer_address" AS b
    WHERE b."customer_id" = a."customer_id"
      AND 'Billing' = ANY(b."types")
      AND b."deleted_at" IS NOT DISTINCT FROM a."deleted_at"
      AND (b."created_at", b."id") < (a."created_at", a."id")
  );--> statement-breakpoint
CREATE UNIQUE INDEX "customer_address_one_billing" ON "customer_address" USING btree ("customer_id") WHERE 'Billing' = ANY("customer_address"."types") AND "customer_address"."deleted_at" IS NULL;