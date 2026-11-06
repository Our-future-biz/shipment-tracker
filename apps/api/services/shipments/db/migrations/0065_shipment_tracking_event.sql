CREATE TABLE IF NOT EXISTS "shipment_tracking_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"container_number" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"occurred_on" date NOT NULL,
	"occurred_at" timestamp with time zone,
	"place" text DEFAULT '' NOT NULL,
	"locode" text DEFAULT '' NOT NULL,
	"vessel" text DEFAULT '' NOT NULL,
	"voyage" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'user' NOT NULL,
	"external_id" text DEFAULT '' NOT NULL,
	"recorded_by_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"payload" jsonb,
	"effect" text DEFAULT 'none' NOT NULL,
	"effect_field" text DEFAULT '' NOT NULL,
	"effect_value" date,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by_id" uuid,
	CONSTRAINT "shipment_tracking_event_shipment_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "shipment_tracking_event_source_check" CHECK ("shipment_tracking_event"."source" IN ('user', 'master_job', 'warehouse', 'trucking', 'customs', 'document', 'carrier', 'system')),
	CONSTRAINT "shipment_tracking_event_effect_check" CHECK ("shipment_tracking_event"."effect" IN ('none', 'proposed', 'applied', 'dismissed'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_tracking_event_company_id_idx" ON "shipment_tracking_event" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_tracking_event_shipment_idx" ON "shipment_tracking_event" USING btree ("shipment_id","occurred_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_tracking_event_proposed_idx" ON "shipment_tracking_event" USING btree ("company_id","effect") WHERE effect = 'proposed';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shipment_tracking_event_external_uq" ON "shipment_tracking_event" USING btree ("company_id","shipment_id","source","external_id") WHERE external_id <> '' AND deleted_at IS NULL;