ALTER TABLE "invoice_cost" ADD COLUMN "unit" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_cost" ADD COLUMN "haulier_id" uuid;--> statement-breakpoint
-- Categories are stored as charge codes (apps/api/lib/chargeCodes.ts). Costs Breakdown stored the
-- label ("Road freight"), master jobs and document reading the older key ("others"), so a real
-- cost posted by key never met its estimate. Each value that means exactly one code becomes that
-- code; the generic keys "freight", "collection" and "locals" mean several and stay as they are.
-- No row is merged or deleted.
CREATE TEMPORARY TABLE "charge_code_map" ("old" text PRIMARY KEY, "code" text NOT NULL);--> statement-breakpoint
INSERT INTO "charge_code_map" ("old", "code") VALUES
  ('ocean freight', 'ocean_freight'),
  ('air freight', 'air_freight'),
  ('rail freight', 'rail_freight'),
  ('road freight', 'road_freight'),
  ('documentation', 'documentation'),
  ('thc origin', 'thc_origin'),
  ('thc destination', 'thc_destination'),
  ('customs clearance', 'customs'),
  ('handling', 'handling'),
  ('delivery', 'delivery'),
  ('pickup', 'pickup'),
  ('insurance', 'insurance'),
  ('inspection', 'inspection'),
  ('storage', 'storage'),
  ('demurrage', 'demurrage'),
  ('other', 'other'),
  ('others', 'other');--> statement-breakpoint
UPDATE "invoice_cost" AS t SET "category" = m."code"
  FROM "charge_code_map" AS m
  WHERE lower(trim(t."category")) = m."old" AND t."category" <> m."code";--> statement-breakpoint
UPDATE "invoice_selling_cost" AS t SET "category" = m."code"
  FROM "charge_code_map" AS m
  WHERE lower(trim(t."category")) = m."old" AND t."category" <> m."code";--> statement-breakpoint
-- A billing override is keyed by the category of its row and follows it, unless the shipment
-- already has one under the code.
UPDATE "billing_override" AS t SET "row_key" = m."code"
  FROM "charge_code_map" AS m
  WHERE lower(trim(t."row_key")) = m."old" AND t."row_key" <> m."code"
    AND NOT EXISTS (
      SELECT 1 FROM "billing_override" AS o
      WHERE o."company_id" = t."company_id" AND o."shipment_id" = t."shipment_id" AND o."row_key" = m."code"
    );--> statement-breakpoint
DROP TABLE "charge_code_map";
