-- Customer sites: every Pickup / Delivery address (Addresses tab) is also a site (Sites tab), the
-- site linked to its address and following it. Existing data is joined up once here:
--   1. a live site with the same street and postcode as a live Pickup / Delivery address of its
--      customer is linked to it (one to one); the address takes on the site's use too, and the
--      site's use follows the address;
--   2. every other live Pickup / Delivery address gets a site (when its postcode is one sites can
--      keep: 5 digits in Czechia);
--   3. every site still without an address gets one, with the site's address and use (the new
--      address takes the site's id, so the two are linked by it).
ALTER TABLE "customer_site" ADD COLUMN "address_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_site" ADD CONSTRAINT "customer_site_address_id_customer_address_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."customer_address"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_site_one_per_address" ON "customer_site" USING btree ("address_id") WHERE "customer_site"."address_id" IS NOT NULL AND "customer_site"."deleted_at" IS NULL;--> statement-breakpoint
WITH pairs AS (
	SELECT s.id AS site_id, a.id AS address_id,
		row_number() OVER (PARTITION BY s.id ORDER BY a.created_at, a.id) AS by_site,
		row_number() OVER (PARTITION BY a.id ORDER BY s.created_at, s.id) AS by_address
	FROM "customer_site" s
	JOIN "customer_address" a ON a."company_id" = s."company_id" AND a."customer_id" = s."customer_id" AND a."deleted_at" IS NULL
		AND a."types" && ARRAY['Pickup', 'Delivery']::text[]
		AND regexp_replace(a."postal_code", '\s', '', 'g') = regexp_replace(s."postcode", '\s', '', 'g')
		AND lower(btrim(a."street")) = lower(btrim(s."street"))
	WHERE s."deleted_at" IS NULL
)
UPDATE "customer_site" s SET "address_id" = p.address_id FROM pairs p WHERE p.site_id = s."id" AND p.by_site = 1 AND p.by_address = 1;--> statement-breakpoint
UPDATE "customer_address" a SET "types" = (
	SELECT array_agg(t ORDER BY array_position(ARRAY['Registered', 'Billing', 'Paperwork', 'Pickup', 'Delivery', 'Warehouse']::text[], t))
	FROM (SELECT DISTINCT unnest(a."types" || CASE s."kind" WHEN 'loading' THEN ARRAY['Pickup'] WHEN 'delivery' THEN ARRAY['Delivery'] ELSE ARRAY['Pickup', 'Delivery'] END) AS t) used
), "updated_at" = now()
FROM "customer_site" s WHERE s."address_id" = a."id" AND s."deleted_at" IS NULL;--> statement-breakpoint
UPDATE "customer_site" s SET "kind" = CASE
	WHEN 'Pickup' = ANY(a."types") AND 'Delivery' = ANY(a."types") THEN 'both'
	WHEN 'Pickup' = ANY(a."types") THEN 'loading'
	ELSE 'delivery'
END
FROM "customer_address" a WHERE s."address_id" = a."id" AND s."deleted_at" IS NULL;--> statement-breakpoint
INSERT INTO "customer_site" ("company_id", "customer_id", "address_id", "label", "kind", "street", "postcode", "city", "country")
SELECT a."company_id", a."customer_id", a."id",
	COALESCE(NULLIF(btrim(a."label"), ''), NULLIF(btrim(a."street"), ''), NULLIF(btrim(a."city"), ''), btrim(a."postal_code")),
	CASE WHEN 'Pickup' = ANY(a."types") AND 'Delivery' = ANY(a."types") THEN 'both' WHEN 'Pickup' = ANY(a."types") THEN 'loading' ELSE 'delivery' END,
	btrim(a."street"),
	CASE WHEN upper(btrim(a."country")) IN ('CZ', '') THEN regexp_replace(a."postal_code", '\s', '', 'g') ELSE btrim(a."postal_code") END,
	btrim(a."city"),
	COALESCE(NULLIF(upper(btrim(a."country")), ''), 'CZ')
FROM "customer_address" a
WHERE a."deleted_at" IS NULL AND a."types" && ARRAY['Pickup', 'Delivery']::text[]
	AND NOT EXISTS (SELECT 1 FROM "customer_site" s WHERE s."address_id" = a."id" AND s."deleted_at" IS NULL)
	AND CASE WHEN upper(btrim(a."country")) IN ('CZ', '') THEN regexp_replace(a."postal_code", '\s', '', 'g') ~ '^\d{5}$' ELSE btrim(a."postal_code") <> '' END;--> statement-breakpoint
INSERT INTO "customer_address" ("id", "company_id", "customer_id", "types", "label", "street", "city", "postal_code", "country", "created_at", "updated_at")
SELECT s."id", s."company_id", s."customer_id",
	CASE s."kind" WHEN 'loading' THEN ARRAY['Pickup'] WHEN 'delivery' THEN ARRAY['Delivery'] ELSE ARRAY['Pickup', 'Delivery'] END,
	s."label", s."street", s."city", s."postcode", s."country", s."created_at", now()
FROM "customer_site" s WHERE s."deleted_at" IS NULL AND s."address_id" IS NULL;--> statement-breakpoint
UPDATE "customer_site" s SET "address_id" = s."id"
WHERE s."deleted_at" IS NULL AND s."address_id" IS NULL AND EXISTS (SELECT 1 FROM "customer_address" a WHERE a."id" = s."id");
