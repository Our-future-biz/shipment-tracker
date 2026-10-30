-- Tariffs: a manager can change the dates of an approved version; the version keeps who changed
-- them last and when. Existing versions never had their dates changed, so both stay empty.
ALTER TABLE "tariff_version" ADD COLUMN "dates_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tariff_version" ADD COLUMN "dates_changed_by" text;