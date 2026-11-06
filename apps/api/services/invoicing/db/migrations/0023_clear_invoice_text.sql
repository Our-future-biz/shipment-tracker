-- The line text printed on an invoice is now the selling row's Description (else its category), and a text of
-- its own is set in Issue invoice. A quote copy used to put the customer's name in the old Invoice text column;
-- that name is cleared, so those lines print the Description. Only rows copied from a quote are touched, so a
-- text somebody typed stays. A row on an issued invoice is cleared only where its line printed the customer's
-- name, so a credit note and a new invoice don't bring the name back; the issued documents keep their own copy
-- of each line. Trucking's rows keep their labels. Safe to run again.
UPDATE "invoice_selling_cost" AS s SET "customer" = '', "updated_at" = now()
WHERE s."customer" <> ''
  AND s."source_quote_number" <> ''
  AND s."source_trucking_ref" IS NULL
  AND s."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "invoice_line" AS l
    JOIN "invoice" AS i ON i."id" = l."invoice_id"
    WHERE l."source_selling_cost_id" = s."id" AND i."kind" = 'invoice' AND i."status" = 'issued' AND i."deleted_at" IS NULL
      AND l."description" <> i."customer"->>'companyName'
  );
