-- The claim_* columns on shipment were superseded by the shipment_claim table (0029)
-- and nothing wrote to them except the grid. Carry any values over as claim rows, then
-- drop them so there is one place a claim lives.
INSERT INTO "shipment_claim" ("company_id", "shipment_id", "kind", "cargo_state", "note")
SELECT "company_id", "id", 'cargo', "claim_cargo_state", "claim_cargo_note"
FROM "shipment"
WHERE btrim("claim_cargo_state" || "claim_cargo_note") <> '';--> statement-breakpoint
INSERT INTO "shipment_claim" ("company_id", "shipment_id", "kind", "supplier", "invoice_number", "reason", "amount")
SELECT "company_id", "id", 'cost', "claim_cost_supplier", "claim_cost_invoice_number", "claim_cost_reason", "claim_cost_amount"
FROM "shipment"
WHERE btrim("claim_cost_supplier" || "claim_cost_invoice_number" || "claim_cost_reason" || "claim_cost_amount") <> '';--> statement-breakpoint
UPDATE "shipment" s SET "claim" = 'Yes' WHERE EXISTS (
  SELECT 1 FROM "shipment_claim" c
  WHERE c."shipment_id" = s."id"
    AND c."deleted_at" IS NULL
    AND btrim(c."cargo_state" || c."note" || c."supplier" || c."invoice_number" || c."reason" || c."amount") <> ''
);--> statement-breakpoint
ALTER TABLE "shipment" DROP COLUMN "claim_cargo_state";--> statement-breakpoint
ALTER TABLE "shipment" DROP COLUMN "claim_cargo_note";--> statement-breakpoint
ALTER TABLE "shipment" DROP COLUMN "claim_cost_supplier";--> statement-breakpoint
ALTER TABLE "shipment" DROP COLUMN "claim_cost_invoice_number";--> statement-breakpoint
ALTER TABLE "shipment" DROP COLUMN "claim_cost_reason";--> statement-breakpoint
ALTER TABLE "shipment" DROP COLUMN "claim_cost_amount";
