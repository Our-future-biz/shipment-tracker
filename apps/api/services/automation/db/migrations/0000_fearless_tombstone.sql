CREATE TABLE "automation_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"shipment_id" uuid NOT NULL,
	"rule_name" text NOT NULL,
	"action" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"triggered_by_id" uuid
);
--> statement-breakpoint
CREATE INDEX "automation_log_created_at_idx" ON "automation_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "automation_log_deleted_at_idx" ON "automation_log" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "automation_log_shipment_id_idx" ON "automation_log" USING btree ("shipment_id");