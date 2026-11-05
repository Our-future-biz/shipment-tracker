-- Since when this system notes that an approved haulier invoice was paid (Council Review 5, K2): one row, the
-- moment this ran. Invoices approved before it are listed apart in What we owe; none of them is changed.
-- Safe to run again (the moment stays the first run's).
CREATE TABLE IF NOT EXISTS "trucking_payment_tracking" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trucking_payment_tracking_one_row" CHECK ("trucking_payment_tracking"."id" = 1)
);--> statement-breakpoint
INSERT INTO "trucking_payment_tracking" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
