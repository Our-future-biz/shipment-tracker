-- One default site per customer. Where several live sites are marked default, the oldest stays the
-- default and the others are unmarked.
UPDATE "customer_site" s SET "is_default" = false
  WHERE s."is_default" AND s."deleted_at" IS NULL
    AND EXISTS (
      SELECT 1 FROM "customer_site" o
      WHERE o."customer_id" = s."customer_id" AND o."is_default" AND o."deleted_at" IS NULL
        AND (o."created_at", o."id") < (s."created_at", s."id")
    );--> statement-breakpoint
CREATE UNIQUE INDEX "customer_site_one_default" ON "customer_site" USING btree ("customer_id") WHERE "customer_site"."is_default" AND "customer_site"."deleted_at" IS NULL;
