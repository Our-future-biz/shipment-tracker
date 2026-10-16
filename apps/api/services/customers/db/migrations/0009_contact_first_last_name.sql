ALTER TABLE "contact" ADD COLUMN "first_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "last_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Existing contacts are split at the first space: "Ales Zavoral" -> "Ales" + "Zavoral". A one-word name becomes the first name.
UPDATE "contact" SET
  "first_name" = split_part(btrim("name"), ' ', 1),
  "last_name" = btrim(substr(btrim("name"), length(split_part(btrim("name"), ' ', 1)) + 1));
