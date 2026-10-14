ALTER TABLE "quote" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "substatus" text;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "lost_reason" text;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "lost_comment" text;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "first_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "valid_until" date;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "last_contact_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "owner_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "owner_match_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "shipment_id" uuid;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "shipment_job_number" text;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "data_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "customer_id" uuid GENERATED ALWAYS AS (CASE WHEN (data->>'customerId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN (data->>'customerId')::uuid END) STORED;--> statement-breakpoint
CREATE INDEX "quote_company_status_idx" ON "quote" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "quote_customer_id_idx" ON "quote" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "quote_owner_user_id_idx" ON "quote" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "quote_unadopted_idx" ON "quote" USING btree ("company_id") WHERE status IS NULL AND jsonb_typeof(data->'quoteStatus') = 'string' AND btrim(data->>'quoteStatus') <> '';