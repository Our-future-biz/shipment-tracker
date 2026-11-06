CREATE TABLE IF NOT EXISTS "shipment_customer_notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"told_to" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"eta_pod" date,
	"eta_warehouse" date,
	"planned_delivery" date,
	"told_by_id" uuid,
	CONSTRAINT "shipment_customer_notice_shipment_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "shipment_customer_notice_kind_check" CHECK ("shipment_customer_notice"."kind" IN ('status', 'arrival_notice', 'eta_change', 'delivery_advice', 'pod_sent', 'draft_sent', 'bl_provided')),
	CONSTRAINT "shipment_customer_notice_channel_check" CHECK ("shipment_customer_notice"."channel" IN ('email', 'phone', 'other'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shipment_tracking_read" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_tracking_read_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "shipment_tracking_read_user_shipment_uq" UNIQUE("user_id","shipment_id")
);
--> statement-breakpoint
ALTER TABLE "shipment_attachment" ADD COLUMN IF NOT EXISTS "source_ref" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_customer_notice_company_id_idx" ON "shipment_customer_notice" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_customer_notice_shipment_idx" ON "shipment_customer_notice" USING btree ("shipment_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_tracking_read_company_id_idx" ON "shipment_tracking_read" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_tracking_read_user_idx" ON "shipment_tracking_read" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shipment_attachment_source_ref_uq" ON "shipment_attachment" USING btree ("company_id","shipment_id","source_ref") WHERE source_ref <> '' AND deleted_at IS NULL;