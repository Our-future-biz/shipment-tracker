-- The line text printed on an invoice is now the selling row's Description (else its category), and a text of
-- its own is set in Issue invoice. The old Invoice text column of Costs Breakdown (often the customer's name,
-- copied from a quote) is cleared on rows not on an issued invoice, so their lines print the Description.
-- Rows on an issued invoice keep theirs; Trucking's rows keep their labels. Safe to run again.
UPDATE "invoice_selling_cost" AS s SET "customer" = '', "updated_at" = now()
WHERE s."customer" <> ''
  AND s."source_trucking_ref" IS NULL
  AND s."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "invoice_line" AS l
    JOIN "invoice" AS i ON i."id" = l."invoice_id"
    WHERE l."source_selling_cost_id" = s."id" AND i."kind" = 'invoice' AND i."status" = 'issued' AND i."deleted_at" IS NULL
  );
