-- Co-Loading Concept: one live sailing per Master Job, so two links or two creates at one moment
-- cannot give one Master Job to two sailings. Council Outlay 14, C2.
-- Where two live sailings hold one Master Job already, the older sailing keeps it. A shipment left
-- linked to a sailing removed at the moment it was linked (before a link waited for the sailing's
-- lock) is taken off it, so it can go on a sailing again.
-- Safe to run again: the local databases are shared by every branch.
UPDATE "co_loading_sailing" AS s SET "master_job_id" = NULL
WHERE s."master_job_id" IS NOT NULL AND s."deleted_at" IS NULL AND EXISTS (
  SELECT 1 FROM "co_loading_sailing" AS o
  WHERE o."company_id" = s."company_id" AND o."master_job_id" = s."master_job_id" AND o."deleted_at" IS NULL
    AND (o."created_at", o."id") < (s."created_at", s."id")
);--> statement-breakpoint
UPDATE "co_loading_sailing_shipment" AS l SET "deleted_at" = now(), "updated_at" = now(), "removed_reason" = 'removed'
FROM "co_loading_sailing" AS s
WHERE s."id" = l."sailing_id" AND s."company_id" = l."company_id" AND s."deleted_at" IS NOT NULL AND l."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "co_loading_sailing_one_master_job" ON "co_loading_sailing" USING btree ("company_id","master_job_id") WHERE master_job_id IS NOT NULL AND deleted_at IS NULL;
