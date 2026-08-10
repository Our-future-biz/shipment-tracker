-- Type corrections: money text -> numeric, shipments_date text -> date.
--
-- Hand-written USING clauses: Postgres has no implicit cast from text to date/numeric,
-- so drizzle's bare "SET DATA TYPE" would be rejected outright. Defaults are dropped
-- first because the existing '' default is not castable either. NULLIF/COALESCE keep
-- any real values intact instead of discarding them.

-- shipments_date: '' (and any unparseable blank) becomes NULL.
ALTER TABLE "shipment" ALTER COLUMN "shipments_date" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "shipments_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "shipments_date" SET DATA TYPE date
  USING NULLIF(trim("shipments_date"), '')::date;--> statement-breakpoint

-- selling / buying: '' becomes 0 so the columns stay NOT NULL with a 0 default.
ALTER TABLE "shipment" ALTER COLUMN "selling" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "selling" SET DATA TYPE numeric(14, 2)
  USING COALESCE(NULLIF(trim("selling"), '')::numeric, 0);--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "selling" SET DEFAULT '0';--> statement-breakpoint

ALTER TABLE "shipment" ALTER COLUMN "buying" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "buying" SET DATA TYPE numeric(14, 2)
  USING COALESCE(NULLIF(trim("buying"), '')::numeric, 0);--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "buying" SET DEFAULT '0';
