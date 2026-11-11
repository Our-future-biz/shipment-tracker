-- One main contact per customer. Customers with several live main contacts from before the rule
-- keep the most recently updated one; the others stay, as ordinary contacts. The contacts of a
-- deleted customer are put right the same way, by the deletion they share: restoring the customer
-- brings them back together, and two main contacts among them would be refused by the index.
UPDATE "contact" AS c
SET "is_main" = false,
  "updated_at" = now()
WHERE c."is_main"
  AND EXISTS (
    SELECT 1 FROM "contact" AS d
    WHERE d."customer_id" = c."customer_id"
      AND d."is_main"
      AND d."deleted_at" IS NOT DISTINCT FROM c."deleted_at"
      AND (d."updated_at", d."id") > (c."updated_at", c."id")
  );--> statement-breakpoint
CREATE UNIQUE INDEX "contact_one_main_per_customer" ON "contact" USING btree ("customer_id") WHERE "contact"."is_main" AND "contact"."deleted_at" IS NULL;
