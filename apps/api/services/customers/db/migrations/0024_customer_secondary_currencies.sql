-- Up to two secondary currencies a customer may be billed in besides its default one.
-- IF NOT EXISTS: system-9 also numbers its customer migrations from 0024, so this one may be
-- renumbered when both reach main; a local database that already has the column must not fail.
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "secondary_currencies" text[] DEFAULT '{}'::text[] NOT NULL;
