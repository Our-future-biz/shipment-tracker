CREATE TABLE "warehouse_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"supplier_email" jsonb NOT NULL,
	"docks" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_supplier_email" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"movement_id" uuid,
	"kind" text NOT NULL,
	"to_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cc_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'sending' NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"provider_id" text DEFAULT '' NOT NULL,
	"requested_by" text DEFAULT '' NOT NULL,
	"requested_by_name" text DEFAULT '' NOT NULL,
	"client_request_id" text NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "warehouse_bonded_entry" ADD COLUMN "movement_id" uuid;--> statement-breakpoint
ALTER TABLE "warehouse_bonded_entry" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "warehouse_bonded_entry" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_bonded_entry" ADD COLUMN "regime" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_bonded_entry" ADD COLUMN "entered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "warehouse_bonded_entry" ADD COLUMN "discharged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "warehouse_bonded_entry" ADD COLUMN "discharge_ref" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_bonded_entry" ADD COLUMN "deadline" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_bonded_entry" ADD COLUMN "voided_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_stock_line" ADD COLUMN "movement_id" uuid;--> statement-breakpoint
ALTER TABLE "warehouse_stock_line" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "warehouse_stock_line" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_stock_line" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "warehouse_stock_line" ADD COLUMN "closed_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_stock_line" ADD COLUMN "received_instant" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "warehouse_stock_line" ADD COLUMN "customs_regime" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_stock_movement" ADD COLUMN "movement_id" uuid;--> statement-breakpoint
ALTER TABLE "warehouse_stock_movement" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "warehouse_stock_movement" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
CREATE INDEX "warehouse_settings_created_at_idx" ON "warehouse_settings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_settings_deleted_at_idx" ON "warehouse_settings" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_settings_company_id_idx" ON "warehouse_settings" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_settings_company_unique" ON "warehouse_settings" USING btree ("company_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "warehouse_supplier_email_created_at_idx" ON "warehouse_supplier_email" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_supplier_email_deleted_at_idx" ON "warehouse_supplier_email" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_supplier_email_company_id_idx" ON "warehouse_supplier_email" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "warehouse_supplier_email_task_idx" ON "warehouse_supplier_email" USING btree ("company_id","task_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_supplier_email_request_unique" ON "warehouse_supplier_email" USING btree ("company_id","client_request_id");--> statement-breakpoint
CREATE INDEX "warehouse_bonded_entry_movement_idx" ON "warehouse_bonded_entry" USING btree ("movement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_bonded_entry_auto_movement_unique" ON "warehouse_bonded_entry" USING btree ("company_id","movement_id") WHERE source = 'auto' AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "warehouse_stock_line_movement_idx" ON "warehouse_stock_line" USING btree ("movement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_stock_line_auto_movement_unique" ON "warehouse_stock_line" USING btree ("company_id","movement_id") WHERE source = 'auto' AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "warehouse_stock_movement_movement_idx" ON "warehouse_stock_movement" USING btree ("movement_id");
--> statement-breakpoint
-- Backfill (stock from gate events): link existing MANUAL rows to their position where the typed
-- job is exactly the WCZ ref of a live task of the same company with exactly one live gate
-- record. Nothing else changes (source stays 'manual'); rows that do not match stay unlinked.
-- No automatic lines are made here: the manager's "Build stock from gate records" does that.
WITH one_gate AS (
  SELECT t.company_id, t.task_id AS ref, t.id AS task_uuid, (array_agg(g.id))[1] AS movement_id
  FROM warehouse_task t
  JOIN warehouse_gate_movement g ON g.warehouse_task_id = t.id AND g.company_id = t.company_id AND g.deleted_at IS NULL
  WHERE t.deleted_at IS NULL
  GROUP BY t.company_id, t.task_id, t.id
  HAVING count(*) = 1
)
UPDATE warehouse_stock_line s SET movement_id = o.movement_id, task_id = o.task_uuid
FROM one_gate o
WHERE s.company_id = o.company_id AND btrim(s.job) = o.ref AND s.movement_id IS NULL AND s.deleted_at IS NULL;
--> statement-breakpoint
WITH one_gate AS (
  SELECT t.company_id, t.task_id AS ref, t.id AS task_uuid, (array_agg(g.id))[1] AS movement_id
  FROM warehouse_task t
  JOIN warehouse_gate_movement g ON g.warehouse_task_id = t.id AND g.company_id = t.company_id AND g.deleted_at IS NULL
  WHERE t.deleted_at IS NULL
  GROUP BY t.company_id, t.task_id, t.id
  HAVING count(*) = 1
)
UPDATE warehouse_bonded_entry b SET movement_id = o.movement_id, task_id = o.task_uuid
FROM one_gate o
WHERE b.company_id = o.company_id AND btrim(b.job) = o.ref AND b.movement_id IS NULL AND b.deleted_at IS NULL;
--> statement-breakpoint
WITH one_gate AS (
  SELECT t.company_id, t.task_id AS ref, t.id AS task_uuid, (array_agg(g.id))[1] AS movement_id
  FROM warehouse_task t
  JOIN warehouse_gate_movement g ON g.warehouse_task_id = t.id AND g.company_id = t.company_id AND g.deleted_at IS NULL
  WHERE t.deleted_at IS NULL
  GROUP BY t.company_id, t.task_id, t.id
  HAVING count(*) = 1
)
UPDATE warehouse_stock_movement mv SET movement_id = o.movement_id, task_id = o.task_uuid
FROM one_gate o
WHERE mv.company_id = o.company_id AND btrim(mv.job) = o.ref AND mv.movement_id IS NULL AND mv.deleted_at IS NULL;
