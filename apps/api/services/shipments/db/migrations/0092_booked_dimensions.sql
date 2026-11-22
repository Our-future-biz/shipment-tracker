-- Booked Dimensions (owner's answer 22 Nov): the package lines of the quote a shipment was made from, set by
-- the server, never edited. A shipment not made from a quote books none ([]); one made from a quote before
-- now stays null until its first read fills it from its quote (shipment.service). New shipments start at [].
-- Safe to run again: the local databases are shared by every branch.
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "booked_dimensions" jsonb;--> statement-breakpoint
UPDATE "shipment" SET "booked_dimensions" = '[]'::jsonb WHERE "booked_dimensions" IS NULL AND NOT "created_from_quote";--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "booked_dimensions" SET DEFAULT '[]'::jsonb;
