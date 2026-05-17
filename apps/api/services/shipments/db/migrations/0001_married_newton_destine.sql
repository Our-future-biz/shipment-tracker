CREATE TABLE "master_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"mcz_number" text NOT NULL,
	CONSTRAINT "master_job_mcz_number_unique" UNIQUE("mcz_number")
);
--> statement-breakpoint
CREATE TABLE "shipment_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"shipment_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_size" bigint DEFAULT 0 NOT NULL,
	"file_type" text DEFAULT '' NOT NULL,
	"storage_key" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"shipment_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"shipment_id" uuid NOT NULL,
	"task_key" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by_id" uuid
);
--> statement-breakpoint
CREATE INDEX "master_job_created_at_idx" ON "master_job" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "master_job_deleted_at_idx" ON "master_job" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "master_job_mcz_number_idx" ON "master_job" USING btree ("mcz_number");--> statement-breakpoint
CREATE INDEX "shipment_attachment_created_at_idx" ON "shipment_attachment" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "shipment_attachment_deleted_at_idx" ON "shipment_attachment" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "shipment_attachment_shipment_id_idx" ON "shipment_attachment" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "shipment_audit_shipment_id_idx" ON "shipment_audit" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "shipment_audit_changed_at_idx" ON "shipment_audit" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "shipment_comment_created_at_idx" ON "shipment_comment" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "shipment_comment_deleted_at_idx" ON "shipment_comment" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "shipment_comment_shipment_id_idx" ON "shipment_comment" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "shipment_task_created_at_idx" ON "shipment_task" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "shipment_task_deleted_at_idx" ON "shipment_task" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "shipment_task_shipment_id_idx" ON "shipment_task" USING btree ("shipment_id");