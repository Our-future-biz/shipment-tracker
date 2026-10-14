-- Invoices entered by hand before the currency column existed were in the customer's currency
-- (the one its credit limit is in), but 0004 gave them the column default CZK. Give them the
-- customer's currency. Rows posted by Invoicing carry their real currency and keep it: their
-- numbers are INV|CN + year + job number + sequence, e.g. INV2026CZ00000028-001.
UPDATE "customer_invoice" AS ci
SET "currency" = c."currency"
FROM "customer" AS c
WHERE ci."customer_id" = c."id"
  AND ci."invoice_number" !~ '^(INV|CN)[0-9]{4}[A-Z]{2}[0-9]+-[0-9]{3,}$'
  AND ci."currency" IS DISTINCT FROM c."currency";
