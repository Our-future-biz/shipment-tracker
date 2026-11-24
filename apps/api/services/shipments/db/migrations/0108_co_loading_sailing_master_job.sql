-- Co-Loading Concept: a sailing's Master Job, one per sailing. Council Outlay 14, C2.
-- Safe to run again: the local databases are shared by every branch.
ALTER TABLE "co_loading_sailing" ADD COLUMN IF NOT EXISTS "master_job_id" uuid;
