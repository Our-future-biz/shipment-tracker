-- "Claim" on a shipment is now derived from its claims: Yes while at least one
-- claim row has something filled in, No otherwise.
ALTER TABLE "shipment" ALTER COLUMN "claim" SET DEFAULT 'No';--> statement-breakpoint
UPDATE "shipment" s SET "claim" = CASE WHEN EXISTS (
  SELECT 1 FROM "shipment_claim" c
  WHERE c."shipment_id" = s."id"
    AND c."deleted_at" IS NULL
    AND btrim(c."cargo_state" || c."note" || c."supplier" || c."invoice_number" || c."reason" || c."amount") <> ''
) THEN 'Yes' ELSE 'No' END;
