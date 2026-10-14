CREATE TABLE "job_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"basis" text NOT NULL,
	"rate_date" date NOT NULL,
	"rates" jsonb NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"previous_rate_date" date,
	"relock_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "job_rate_created_at_idx" ON "job_rate" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "job_rate_deleted_at_idx" ON "job_rate" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "job_rate_company_id_idx" ON "job_rate" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_rate_company_shipment_unique" ON "job_rate" USING btree ("company_id","shipment_id");