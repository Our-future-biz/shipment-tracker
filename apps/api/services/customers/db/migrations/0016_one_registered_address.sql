-- One seat per customer: at most one live Registered address. Duplicates made before the rule
-- (addresses could be added with type Registered freely) are reduced to the newest one; the
-- others are soft-deleted (kept, with their data), not removed.
UPDATE "customer_address" AS a
SET "deleted_at" = now(), "updated_at" = now()
WHERE a."type" = 'Registered'
  AND a."deleted_at" IS NULL
  AND EXISTS (
    SELECT 1 FROM "customer_address" AS b
    WHERE b."customer_id" = a."customer_id"
      AND b."type" = 'Registered'
      AND b."deleted_at" IS NULL
      AND (b."created_at", b."id") > (a."created_at", a."id")
  );--> statement-breakpoint
CREATE UNIQUE INDEX "customer_address_one_registered" ON "customer_address" USING btree ("customer_id") WHERE "customer_address"."type" = 'Registered' AND "customer_address"."deleted_at" IS NULL;
