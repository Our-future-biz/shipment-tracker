-- Hand-added: btree_gist lets the dock-slot EXCLUDE constraint (end of file) compare company and dock with "=" next to the time-range overlap. It is a trusted extension (the app's role may create it), as pg_trgm is for the auth service.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "warehouse_gate_file" ADD COLUMN "client_request_id" text;--> statement-breakpoint
ALTER TABLE "warehouse_exception" ADD COLUMN "client_request_id" text;--> statement-breakpoint
ALTER TABLE "warehouse_dock_slot" ADD COLUMN "movement_id" uuid;--> statement-breakpoint
ALTER TABLE "warehouse_dock_slot" ADD COLUMN "duration_min" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_dock_slot" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "warehouse_dock_slot" ADD COLUMN "ends_at" timestamp with time zone;--> statement-breakpoint
-- Hand-added backfill: existing slots get their start / end as instants (Prague time, 60 minutes), only where date and time are well formed and the date is a real calendar day (a stored "2026-02-30" is skipped, not cast — the cast would fail the migration); the CASEs keep the checks in order so nothing is cast before it is checked. The dock text is trimmed as the service now stores it.
UPDATE "warehouse_dock_slot"
SET "starts_at" = ("date" || ' ' || "time")::timestamp AT TIME ZONE 'Europe/Prague',
    "ends_at" = (("date" || ' ' || "time")::timestamp AT TIME ZONE 'Europe/Prague') + interval '60 minutes',
    "dock" = btrim("dock")
WHERE CASE
  WHEN "date" ~ '^\d{4}-\d{2}-\d{2}$' AND "time" ~ '^([01]\d|2[0-3]):[0-5]\d$' THEN
    CASE
      WHEN substr("date", 1, 4)::int >= 1 AND substr("date", 6, 2)::int BETWEEN 1 AND 12 THEN
        substr("date", 9, 2)::int BETWEEN 1 AND extract(day FROM make_date(substr("date", 1, 4)::int, substr("date", 6, 2)::int, 1) + interval '1 month' - interval '1 day')::int
      ELSE false
    END
  ELSE false
END;--> statement-breakpoint
-- Hand-added, best effort: a slot whose reference is the WCZ reference of a live position is linked to that position's live gate movement.
UPDATE "warehouse_dock_slot" s
SET "movement_id" = (
  SELECT m."id"
  FROM "warehouse_gate_movement" m
  JOIN "warehouse_task" t ON t."id" = m."warehouse_task_id" AND t."deleted_at" IS NULL
  WHERE m."company_id" = s."company_id" AND m."deleted_at" IS NULL AND t."task_id" = btrim(s."reference")
  ORDER BY m."created_at" DESC
  LIMIT 1
)
WHERE s."movement_id" IS NULL AND btrim(s."reference") <> '';--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_gate_file_request_unique" ON "warehouse_gate_file" USING btree ("company_id","movement_id","client_request_id") WHERE client_request_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_exception_request_unique" ON "warehouse_exception" USING btree ("company_id","movement_id","client_request_id") WHERE client_request_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "warehouse_dock_slot_movement_idx" ON "warehouse_dock_slot" USING btree ("movement_id");--> statement-breakpoint
-- Hand-added: no double booking of a dock door. Two live slots of one company on the same dock may not overlap in time; "[)" bounds let a slot start when the previous one ends. Cancelled and Completed slots free the door. drizzle-kit cannot model EXCLUDE, so it is not in the snapshot and a later generate will not drop it. Existing overlapping slots make this fail loudly (no silent data change).
ALTER TABLE "warehouse_dock_slot" ADD CONSTRAINT "warehouse_dock_slot_no_overlap"
  EXCLUDE USING gist ("company_id" WITH =, "dock" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("deleted_at" IS NULL AND "starts_at" IS NOT NULL AND "status" NOT IN ('Cancelled', 'Completed'));
