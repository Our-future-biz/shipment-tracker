-- Co-Loading Concept: a service carries the shipments' Service Name it stands for (ISHA, Domestic), picked in
-- New Service. Safe to run again: the local databases are shared by every branch.
ALTER TABLE "co_loading_service" ADD COLUMN IF NOT EXISTS "service_name" text DEFAULT '' NOT NULL;
