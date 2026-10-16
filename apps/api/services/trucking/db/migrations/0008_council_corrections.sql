-- Trucking Council corrections: consignment notices and one consignment per quote (M);
-- bank-account change stamp, repriced trips / partner legs, invoice hold reasons, portal account
-- lock level and the per-IP login throttle (S).
CREATE TABLE "trucking_portal_login_throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"lock_level" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trucking_portal_login_throttle_failures_check" CHECK ("trucking_portal_login_throttle"."failures" >= 0)
);
--> statement-breakpoint
ALTER TABLE "trucking_haulier_invoice" ADD COLUMN "hold_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trucking_portal_user" ADD COLUMN "lock_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "trucking_consignment" ADD COLUMN "notices" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trucking_leg" ADD COLUMN "buy_repriced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trucking_leg" ADD COLUMN "buy_repriced_by" text;--> statement-breakpoint
ALTER TABLE "trucking_trip" ADD COLUMN "buy_repriced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trucking_trip" ADD COLUMN "buy_repriced_by" text;--> statement-breakpoint
ALTER TABLE "trucking_haulier_profile" ADD COLUMN "bank_accounts_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trucking_haulier_profile" ADD COLUMN "bank_accounts_changed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "trucking_haulier_profile" ADD COLUMN "bank_accounts_changed_by" text;--> statement-breakpoint
CREATE INDEX "trucking_portal_login_throttle_updated_idx" ON "trucking_portal_login_throttle" USING btree ("updated_at");--> statement-breakpoint
-- One consignment per quote (decision 10). A quote that already prices more than one live
-- consignment keeps the oldest; each later one keeps its price, its lines and the quote number,
-- but as an agreed price (source MANUAL) with the reason written on it, so the index never fails.
UPDATE "trucking_consignment" c
SET "sell" = jsonb_set(
      jsonb_set(c."sell", '{source}', '"MANUAL"'),
      '{overrideReason}',
      to_jsonb(format('Quote %s already prices %s (one consignment per quote): kept as an agreed price', c."quote_number", d."kept_ref"))
    ),
    "version" = c."version" + 1,
    "updated_at" = now()
FROM (
  SELECT "id",
         first_value("ref") OVER w AS "kept_ref",
         row_number() OVER w AS "n"
  FROM "trucking_consignment"
  WHERE "quote_number" IS NOT NULL AND "cancelled_at" IS NULL AND "deleted_at" IS NULL AND "sell"->>'source' = 'QUOTE'
  WINDOW w AS (PARTITION BY "company_id", "quote_number" ORDER BY "created_at", "id")
) d
WHERE c."id" = d."id" AND d."n" > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_consignment_quote_unique" ON "trucking_consignment" USING btree ("company_id","quote_number") WHERE quote_number IS NOT NULL AND cancelled_at IS NULL AND deleted_at IS NULL AND sell->>'source' = 'QUOTE';