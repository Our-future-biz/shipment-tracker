-- Shipments → Managers step 6 (Council Outlay 11, 19 Nov 2026), new data:
--   shipment          the three B/L dates (originals received, telex release received, delivery order), the reason a
--                     job was cancelled, and the users Handled By / Holiday Cover name (filled on each write and by a
--                     daily backfill; null for a name that is no user).
--   shipment_claim    a claim on the shipment (cargo) gets a lifecycle - open, notified, with_insurer, settled, rejected,
--                     withdrawn -, an owner, the day the insurer was told and what was settled. Claims on costs keep
--                     their statuses.
--   claim_time_limits per company: the notice days and suit months by mode. Off until a manager confirms the numbers.
--   shipment_absence_cover  the Holiday Cover an absence set on a job, so it is cleared when the absence ends.
-- Then the job's Claim flag is set again from its claims: it now means "an open claim stands", not "a claim ever
-- stood" - today that can only turn Yes into No, on jobs whose claims are all closed.
-- Safe to run again.
CREATE TABLE IF NOT EXISTS "claim_time_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"sea_notice_days" smallint DEFAULT 3 NOT NULL,
	"air_notice_days" smallint DEFAULT 14 NOT NULL,
	"rail_notice_days" smallint DEFAULT 7 NOT NULL,
	"road_notice_days" smallint DEFAULT 7 NOT NULL,
	"sea_suit_months" smallint DEFAULT 12 NOT NULL,
	"air_suit_months" smallint DEFAULT 24 NOT NULL,
	"rail_suit_months" smallint DEFAULT 12 NOT NULL,
	"road_suit_months" smallint DEFAULT 12 NOT NULL,
	"confirmed_by_user_id" uuid,
	"confirmed_by" text DEFAULT '' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"updated_by_user_id" uuid,
	"updated_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "claim_time_limits_numbers_check" CHECK ("claim_time_limits"."sea_notice_days" BETWEEN 1 AND 365 AND "claim_time_limits"."air_notice_days" BETWEEN 1 AND 365 AND "claim_time_limits"."rail_notice_days" BETWEEN 1 AND 365 AND "claim_time_limits"."road_notice_days" BETWEEN 1 AND 365 AND "claim_time_limits"."sea_suit_months" BETWEEN 1 AND 120 AND "claim_time_limits"."air_suit_months" BETWEEN 1 AND 120 AND "claim_time_limits"."rail_suit_months" BETWEEN 1 AND 120 AND "claim_time_limits"."road_suit_months" BETWEEN 1 AND 120),
	CONSTRAINT "claim_time_limits_confirmed_check" CHECK (NOT "claim_time_limits"."enabled" OR "claim_time_limits"."confirmed_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shipment_absence_cover" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"absence_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"absent_user_id" uuid NOT NULL,
	"absent_email" text NOT NULL,
	"absent_name" text DEFAULT '' NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"cover_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"set_at" timestamp with time zone,
	"cleared_at" timestamp with time zone,
	"outcome" text,
	CONSTRAINT "shipment_absence_cover_outcome_check" CHECK ("shipment_absence_cover"."outcome" IS NULL OR "shipment_absence_cover"."outcome" IN ('cleared', 'changed', 'gone')),
	CONSTRAINT "shipment_absence_cover_cleared_check" CHECK (("shipment_absence_cover"."cleared_at" IS NULL) = ("shipment_absence_cover"."outcome" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "shipment_claim" DROP CONSTRAINT IF EXISTS "shipment_claim_status_check";--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "originals_received_date" date;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "telex_release_received_date" date;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "delivery_order_date" date;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "person_in_charge_user_id" uuid;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "holiday_cover_user_id" uuid;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "cancel_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_claim" ADD COLUMN IF NOT EXISTS "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "shipment_claim" ADD COLUMN IF NOT EXISTS "owner_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_claim" ADD COLUMN IF NOT EXISTS "insurer_notified_on" date;--> statement-breakpoint
ALTER TABLE "shipment_claim" ADD COLUMN IF NOT EXISTS "settled_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "shipment_claim" ADD COLUMN IF NOT EXISTS "settled_currency" text DEFAULT '' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipment_absence_cover" ADD CONSTRAINT "shipment_absence_cover_shipment_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "claim_time_limits_company_unique" ON "claim_time_limits" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_absence_cover_open_idx" ON "shipment_absence_cover" USING btree ("company_id") WHERE cleared_at IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_absence_cover_shipment_id_idx" ON "shipment_absence_cover" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shipment_absence_cover_open_unique" ON "shipment_absence_cover" USING btree ("absence_id","shipment_id") WHERE cleared_at IS NULL;--> statement-breakpoint
ALTER TABLE "shipment_claim" DROP CONSTRAINT IF EXISTS "shipment_claim_status_check";--> statement-breakpoint
ALTER TABLE "shipment_claim" ADD CONSTRAINT "shipment_claim_status_check" CHECK (("shipment_claim"."kind" = 'cost' AND "shipment_claim"."status" IN ('open', 'accepted', 'rejected', 'withdrawn')) OR ("shipment_claim"."kind" = 'cargo' AND "shipment_claim"."status" IN ('open', 'notified', 'with_insurer', 'settled', 'rejected', 'withdrawn')));--> statement-breakpoint
UPDATE "shipment" s SET "claim" = CASE WHEN EXISTS (
  SELECT 1 FROM "shipment_claim" c
  WHERE c.shipment_id = s.id AND c.company_id = s.company_id AND c.deleted_at IS NULL
    AND ((c.kind = 'cargo' AND c.status IN ('open', 'notified', 'with_insurer')) OR (c.kind = 'cost' AND c.status = 'open'))
    AND (btrim(c.cargo_state || c.note || c.supplier || c.invoice_number || c.reason || c.amount || c.claim_currency) <> ''
         OR c.supplier_invoice_id IS NOT NULL OR c.claim_amount IS NOT NULL)
) THEN 'Yes' ELSE 'No' END
WHERE s.deleted_at IS NULL AND s.claim IS DISTINCT FROM (CASE WHEN EXISTS (
  SELECT 1 FROM "shipment_claim" c
  WHERE c.shipment_id = s.id AND c.company_id = s.company_id AND c.deleted_at IS NULL
    AND ((c.kind = 'cargo' AND c.status IN ('open', 'notified', 'with_insurer')) OR (c.kind = 'cost' AND c.status = 'open'))
    AND (btrim(c.cargo_state || c.note || c.supplier || c.invoice_number || c.reason || c.amount || c.claim_currency) <> ''
         OR c.supplier_invoice_id IS NOT NULL OR c.claim_amount IS NOT NULL)
) THEN 'Yes' ELSE 'No' END);
