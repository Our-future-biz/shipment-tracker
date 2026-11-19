-- Mock test council L2 (19 Nov 2026): automatic reminders go only to invoices that became overdue after they were
-- switched on; the older ones stay for a manager to chase by hand. The day they were switched on is kept here.
-- Safe twice and on data: the column is added only when missing, and a company that has them on already (none while
-- e-mail from the app is switched off) takes the day its settings were last saved as that day.
ALTER TABLE "receivable_settings" ADD COLUMN IF NOT EXISTS "auto_reminders_since" date;--> statement-breakpoint
UPDATE "receivable_settings"
SET "auto_reminders_since" = ("updated_at" AT TIME ZONE 'Europe/Prague')::date
WHERE "auto_reminders" = true AND "auto_reminders_since" IS NULL;
