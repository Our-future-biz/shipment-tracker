CREATE TABLE "master_job_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"master_job_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_size" bigint DEFAULT 0 NOT NULL,
	"file_type" text DEFAULT '' NOT NULL,
	"storage_key" text DEFAULT '' NOT NULL,
	"document_type" text DEFAULT '' NOT NULL,
	"uploaded_by_id" uuid
);
--> statement-breakpoint
ALTER TABLE "master_job_document" ADD CONSTRAINT "master_job_document_master_job_id_master_job_id_fk" FOREIGN KEY ("master_job_id") REFERENCES "public"."master_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "master_job_document_company_id_idx" ON "master_job_document" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "master_job_document_master_job_id_idx" ON "master_job_document" USING btree ("master_job_id");