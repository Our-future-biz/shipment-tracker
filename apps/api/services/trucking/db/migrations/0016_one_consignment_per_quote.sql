-- One live consignment per quote whatever it is priced by (decision 10): an agreed or tariff price
-- naming the quote takes it as one priced from it does, and the number is compared without the
-- letters of the quote's Freight Mode (lib/salesReference), so another spelling can't pass the
-- index. Where a quote is already on more than one live consignment, the oldest keeps it; each later
-- one keeps its price and lines but no longer names the quote (one priced from it becomes an agreed
-- price, the reason written on it), so the index never fails.
UPDATE "trucking_consignment" c
SET "sell" = CASE
      WHEN c."sell"->>'source' = 'QUOTE' THEN jsonb_set(
        jsonb_set(c."sell", '{source}', '"MANUAL"'),
        '{overrideReason}',
        to_jsonb(format('Quote %s is already on %s (one consignment per quote): kept as an agreed price', c."quote_number", d."kept_ref"))
      )
      ELSE c."sell"
    END,
    "quote_number" = NULL,
    "version" = c."version" + 1,
    "updated_at" = now()
FROM (
  SELECT "id",
         first_value("ref") OVER w AS "kept_ref",
         row_number() OVER w AS "n"
  FROM "trucking_consignment"
  WHERE "quote_number" IS NOT NULL AND "cancelled_at" IS NULL AND "deleted_at" IS NULL
  WINDOW w AS (
    PARTITION BY "company_id", regexp_replace("quote_number", '^QCZ(RAIL|ROAD|AIR|FCL|LCL|BB)([0-9]{8})', 'QCZ\2')
    ORDER BY "created_at", "id"
  )
) d
WHERE c."id" = d."id" AND d."n" > 1;--> statement-breakpoint
DROP INDEX "trucking_consignment_quote_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_consignment_quote_unique" ON "trucking_consignment" USING btree ("company_id",regexp_replace("quote_number", '^QCZ(RAIL|ROAD|AIR|FCL|LCL|BB)([0-9]{8})', 'QCZ\2')) WHERE quote_number IS NOT NULL AND cancelled_at IS NULL AND deleted_at IS NULL;
