CREATE TABLE "shipment_event_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"event" jsonb NOT NULL,
	"acting_user_id" text NOT NULL,
	"acting_role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "shipment_event_outbox_status_check" CHECK ("shipment_event_outbox"."status" IN ('pending', 'sent', 'failed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "shipment_event_outbox" ADD CONSTRAINT "shipment_event_outbox_shipment_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_event_outbox_company_id_idx" ON "shipment_event_outbox" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "shipment_event_outbox_due_idx" ON "shipment_event_outbox" USING btree ("next_attempt_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "shipment_event_outbox_shipment_idx" ON "shipment_event_outbox" USING btree ("shipment_id","created_at");