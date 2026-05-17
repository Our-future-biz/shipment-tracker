CREATE TABLE "warehouse_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"task_id" text NOT NULL,
	"shipment_id" uuid,
	"type" text DEFAULT 'Import' NOT NULL,
	"priority" text DEFAULT 'Medium' NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"assignee" text DEFAULT '' NOT NULL,
	"due_date" text DEFAULT '' NOT NULL,
	"cargo" text DEFAULT '' NOT NULL,
	"weight" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"data" jsonb,
	CONSTRAINT "warehouse_task_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
CREATE INDEX "warehouse_task_created_at_idx" ON "warehouse_task" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "warehouse_task_deleted_at_idx" ON "warehouse_task" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "warehouse_task_task_id_idx" ON "warehouse_task" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "warehouse_task_shipment_id_idx" ON "warehouse_task" USING btree ("shipment_id");