-- Mock test council P8 (19 Nov 2026): a payment taken back says how - noted by mistake (it never counted: the month-end
-- never counts it on any day), or reversed on a day (a bank return, a refund: it was paid, so the month-end counts it as
-- paid on the days before it went back). Every take-back before this one was a mistake (decision L1), so those rows say
-- so; a write-off or bank charge taken back is always a mistake.
-- Safe twice and on data: the columns and the check are added only when missing, the rows filled only where empty.
ALTER TABLE "receivable_payment" ADD COLUMN IF NOT EXISTS "taken_back_kind" text;--> statement-breakpoint
ALTER TABLE "receivable_payment" ADD COLUMN IF NOT EXISTS "reversed_on" date;--> statement-breakpoint
UPDATE "receivable_payment"
SET "taken_back_kind" = 'mistake'
WHERE "taken_back_at" IS NOT NULL AND "taken_back_kind" IS NULL;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivable_payment_taken_back_kind_check') THEN
    ALTER TABLE "receivable_payment" ADD CONSTRAINT "receivable_payment_taken_back_kind_check" CHECK ("receivable_payment"."taken_back_kind" IS NULL OR ("receivable_payment"."taken_back_kind" = 'mistake' AND "receivable_payment"."reversed_on" IS NULL) OR ("receivable_payment"."taken_back_kind" = 'reversed' AND "receivable_payment"."reversed_on" IS NOT NULL));
  END IF;
END $$;--> statement-breakpoint
-- Mock test council P3 (19 Nov 2026): the day automatic reminders start is the first day e-mail from the app can really
-- send - set by the first daily run that finds them on and e-mail on, never by a save while e-mail is off. E-mail from
-- the app has never been switched on (lib/email), so no day stored so far is such a day: every company's is cleared, and
-- an invoice owed since a save never gets reminder 1 by surprise on the first day e-mail works. Safe twice: clearing an
-- empty day again changes nothing.
UPDATE "receivable_settings"
SET "auto_reminders_since" = NULL
WHERE "auto_reminders_since" IS NOT NULL;
