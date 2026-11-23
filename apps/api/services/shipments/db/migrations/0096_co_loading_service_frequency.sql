-- Co-Loading Concept: how often a service runs (weekly, bi_weekly, ad_hoc), picked in New Service.
-- Safe to run again: the local databases are shared by every branch.
ALTER TABLE "co_loading_service" ADD COLUMN IF NOT EXISTS "frequency" text DEFAULT '' NOT NULL;
