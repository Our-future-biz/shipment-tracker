-- Tariffs: each tariff says which sea ports it is for and whether it is import, export or both,
-- ticked by the user (an operator can have one for Hamburg / Bremerhaven and another for Koper).
-- No tariff exists yet, so the columns need no default.
ALTER TABLE "tariff" ADD COLUMN "ports" text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tariff" ADD COLUMN "directions" text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tariff" ADD CONSTRAINT "tariff_ports_check" CHECK (cardinality("tariff"."ports") > 0);--> statement-breakpoint
ALTER TABLE "tariff" ADD CONSTRAINT "tariff_directions_check" CHECK (cardinality("tariff"."directions") > 0 AND "tariff"."directions" <@ ARRAY['import', 'export']::text[]);