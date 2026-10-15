CREATE TABLE "followup_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"type" text DEFAULT 'Call' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"due_date" date,
	"assignee_user_id" uuid,
	"customer_id" uuid,
	"customer_label" text DEFAULT '' NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"quote_number" text,
	"done_at" timestamp with time zone,
	"done_by" uuid,
	"created_by" uuid,
	"legacy_index" integer
);
--> statement-breakpoint
CREATE INDEX "followup_task_created_at_idx" ON "followup_task" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "followup_task_deleted_at_idx" ON "followup_task" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "followup_task_company_id_idx" ON "followup_task" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "followup_task_assignee_user_id_idx" ON "followup_task" USING btree ("assignee_user_id");--> statement-breakpoint
CREATE INDEX "followup_task_due_date_idx" ON "followup_task" USING btree ("due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "followup_task_company_legacy_unique" ON "followup_task" USING btree ("company_id","legacy_index") WHERE legacy_index IS NOT NULL;