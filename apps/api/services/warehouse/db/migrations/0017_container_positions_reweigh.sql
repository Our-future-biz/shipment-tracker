CREATE TABLE "warehouse_container_position" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"container_id" uuid NOT NULL,
	"movement_id" uuid NOT NULL,
	"task_id" uuid,
	"sequence" integer DEFAULT 0 NOT NULL,
	"added_by" text DEFAULT '' NOT NULL,
	"stuffed_at" timestamp with time zone,
	"stuffed_by" text DEFAULT '' NOT NULL,
	"tally_outcome" text DEFAULT '' NOT NULL,
	"tally_pieces" integer,
	"tally_condition" text DEFAULT '' NOT NULL,
	"tally_location" text DEFAULT '' NOT NULL,
	"tally_note" text DEFAULT '' NOT NULL,
	"tally_reason" text DEFAULT '' NOT NULL,
	"ticked_at" timestamp with time zone,
	"ticked_by" text DEFAULT '' NOT NULL,
	"client_request_id" text
);
--> statement-breakpoint
CREATE TABLE "warehouse_reweigh" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"movement_id" uuid NOT NULL,
	"task_id" uuid,
	"weighed_kg" double precision NOT NULL,
	"declared_kg" double precision,
	"declared_source" text DEFAULT '' NOT NULL,
	"variance_pct" double precision,
	"flagged" boolean DEFAULT false NOT NULL,
	"weighed_by" text DEFAULT '' NOT NULL,
	"weighed_at" timestamp with time zone NOT NULL,
	"file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"client_request_id" text
);
--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "left_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "warehouse_gate_movement" ADD COLUMN "left_container_id" uuid;--> statement-breakpoint
ALTER TABLE "warehouse_container" ADD COLUMN "booking_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_container" ADD COLUMN "mbl_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_container" ADD COLUMN "vessel" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_container" ADD COLUMN "voyage" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_container" ADD COLUMN "gate_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "warehouse_container" ADD COLUMN "stripping_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "warehouse_container" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "warehouse_container" ADD COLUMN "closed_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_container" ADD COLUMN "gate_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "warehouse_container" ADD COLUMN "plate" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_container" ADD COLUMN "events" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_container" ADD COLUMN "updated_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "warehouse_container_position_created_at_idx" ON "warehouse_container_position" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_container_position_deleted_at_idx" ON "warehouse_container_position" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_container_position_company_id_idx" ON "warehouse_container_position" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "warehouse_container_position_container_idx" ON "warehouse_container_position" USING btree ("container_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_container_position_live_unique" ON "warehouse_container_position" USING btree ("company_id","movement_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_container_position_request_unique" ON "warehouse_container_position" USING btree ("company_id","container_id","client_request_id") WHERE client_request_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "warehouse_reweigh_created_at_idx" ON "warehouse_reweigh" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_reweigh_deleted_at_idx" ON "warehouse_reweigh" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_reweigh_company_id_idx" ON "warehouse_reweigh" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "warehouse_reweigh_movement_idx" ON "warehouse_reweigh" USING btree ("movement_id","weighed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_reweigh_request_unique" ON "warehouse_reweigh" USING btree ("company_id","movement_id","client_request_id") WHERE client_request_id IS NOT NULL;--> statement-breakpoint
-- Hand-added backfill: a container registered for one position (the legacy movement_id) gets that position as its house, so existing containers keep working. A position is in at most one container at a time: when one position had several live containers, only its oldest becomes its link (the others keep their legacy movement_id, which surveys still read). Archived positions and deleted containers get no link. movement_id is not cleared.
INSERT INTO "warehouse_container_position" ("company_id", "container_id", "movement_id", "task_id", "sequence", "added_by", "created_at", "updated_at")
SELECT DISTINCT ON (c."movement_id") c."company_id", c."id", c."movement_id", m."warehouse_task_id", 1, 'migration', c."created_at", c."created_at"
FROM "warehouse_container" c
JOIN "warehouse_gate_movement" m ON m."id" = c."movement_id" AND m."company_id" = c."company_id" AND m."deleted_at" IS NULL
WHERE c."deleted_at" IS NULL AND c."movement_id" IS NOT NULL
ORDER BY c."movement_id", c."created_at", c."id"
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Hand-added, best effort: the container's typed gate-in / gate-out dates become its stamps (00:00 Prague time of that day), only for well-formed real calendar days (as in 0016, the CASEs keep the checks in order so nothing is cast before it is checked). These are history only: no shipment is written and no position is moved by them.
UPDATE "warehouse_container"
SET "gate_in_at" = ("gated_in" || ' 00:00')::timestamp AT TIME ZONE 'Europe/Prague'
WHERE "gate_in_at" IS NULL AND CASE
  WHEN "gated_in" ~ '^\d{4}-\d{2}-\d{2}$' THEN
    CASE
      WHEN substr("gated_in", 1, 4)::int >= 1 AND substr("gated_in", 6, 2)::int BETWEEN 1 AND 12 THEN
        substr("gated_in", 9, 2)::int BETWEEN 1 AND extract(day FROM make_date(substr("gated_in", 1, 4)::int, substr("gated_in", 6, 2)::int, 1) + interval '1 month' - interval '1 day')::int
      ELSE false
    END
  ELSE false
END;--> statement-breakpoint
UPDATE "warehouse_container"
SET "gate_out_at" = ("gated_out" || ' 00:00')::timestamp AT TIME ZONE 'Europe/Prague'
WHERE "gate_out_at" IS NULL AND "gate_in_at" IS NOT NULL AND CASE
  WHEN "gated_out" ~ '^\d{4}-\d{2}-\d{2}$' THEN
    CASE
      WHEN substr("gated_out", 1, 4)::int >= 1 AND substr("gated_out", 6, 2)::int BETWEEN 1 AND 12 THEN
        substr("gated_out", 9, 2)::int BETWEEN 1 AND extract(day FROM make_date(substr("gated_out", 1, 4)::int, substr("gated_out", 6, 2)::int, 1) + interval '1 month' - interval '1 day')::int
      ELSE false
    END
  ELSE false
END;
