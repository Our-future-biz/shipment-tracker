CREATE TABLE "warehouse_gate_event_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"movement_id" uuid NOT NULL,
	"event" jsonb NOT NULL,
	"acting_user_id" text NOT NULL,
	"acting_role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "wh_gate_event_outbox_status_check" CHECK ("warehouse_gate_event_outbox"."status" IN ('pending', 'sent', 'failed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "warehouse_dock_slot" ADD COLUMN "trip_ref" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouse_gate_event_outbox" ADD CONSTRAINT "wh_gate_event_outbox_movement_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."warehouse_gate_movement"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "warehouse_gate_event_outbox_created_at_idx" ON "warehouse_gate_event_outbox" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_gate_event_outbox_deleted_at_idx" ON "warehouse_gate_event_outbox" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_gate_event_outbox_company_id_idx" ON "warehouse_gate_event_outbox" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "wh_gate_event_outbox_due_idx" ON "warehouse_gate_event_outbox" USING btree ("next_attempt_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "wh_gate_event_outbox_movement_idx" ON "warehouse_gate_event_outbox" USING btree ("movement_id","created_at");--> statement-breakpoint
CREATE INDEX "warehouse_dock_slot_trip_idx" ON "warehouse_dock_slot" USING btree ("movement_id","trip_ref") WHERE trip_ref <> '';