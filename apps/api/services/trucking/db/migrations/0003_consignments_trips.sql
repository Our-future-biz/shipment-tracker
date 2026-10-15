-- Phase 4: consignments (TCZ), FTL trips (LCZ) with their transport order, legs (one per FTL
-- consignment; LTL legs come in Phase 5), the haulier's link (token stored hashed), documents,
-- the reference counters and the outbox to Shipments / Invoicing. trucking_event gains the
-- consignment and trip it is about (it stays append-only: trigger of migration 0000).
CREATE TABLE "trucking_consignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"shipment_id" uuid NOT NULL,
	"job_number" text DEFAULT '' NOT NULL,
	"customer_id" uuid NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"quote_number" text,
	"scope" text DEFAULT 'FTL' NOT NULL,
	"service_level" text,
	"status" text DEFAULT 'BOOKED' NOT NULL,
	"pickup_date" date NOT NULL,
	"pickup_time" text,
	"pickup" jsonb NOT NULL,
	"delivery" jsonb NOT NULL,
	"load" jsonb NOT NULL,
	"promised_date" date,
	"chargeable_kg" numeric(12, 2),
	"sell" jsonb,
	"sell_czk" numeric(14, 2),
	"est_buy_czk" numeric(14, 2),
	"below_floor" boolean DEFAULT false NOT NULL,
	"margin_approval" jsonb,
	"trip_id" uuid,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" text,
	"picked_up_at" timestamp with time zone,
	"picked_up_by" text,
	"delivered_at" timestamp with time zone,
	"delivered_by" text,
	"pod_received_at" timestamp with time zone,
	"pod_received_by" text,
	"pod_source" text,
	"ready_to_bill_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"cancel_reason" text,
	"created_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "trucking_consignment_scope_check" CHECK ("trucking_consignment"."scope" IN ('FTL')),
	CONSTRAINT "trucking_consignment_status_check" CHECK ("trucking_consignment"."status" IN ('BOOKED', 'PLANNED', 'ORDERED', 'CONFIRMED', 'PICKED_UP', 'DELIVERED', 'POD_RECEIVED', 'READY_TO_BILL', 'CANCELLED')),
	CONSTRAINT "trucking_consignment_pod_source_check" CHECK ("trucking_consignment"."pod_source" IS NULL OR "trucking_consignment"."pod_source" IN ('USER', 'HAULIER')),
	CONSTRAINT "trucking_consignment_ref_check" CHECK ("trucking_consignment"."ref" ~ '^TCZ[0-9]{10}$'),
	CONSTRAINT "trucking_consignment_stamp_order_check" CHECK (("trucking_consignment"."delivered_at" IS NULL OR "trucking_consignment"."picked_up_at" IS NOT NULL) AND ("trucking_consignment"."pod_received_at" IS NULL OR "trucking_consignment"."delivered_at" IS NOT NULL) AND ("trucking_consignment"."ready_to_bill_at" IS NULL OR "trucking_consignment"."pod_received_at" IS NOT NULL)),
	CONSTRAINT "trucking_consignment_cancelled_check" CHECK (("trucking_consignment"."status" = 'CANCELLED') = ("trucking_consignment"."cancelled_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "trucking_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"consignment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"source" text NOT NULL,
	"uploaded_by_user_id" uuid,
	"uploaded_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "trucking_document_kind_check" CHECK ("trucking_document"."kind" IN ('POD', 'CMR', 'DELIVERY_NOTE', 'OTHER')),
	CONSTRAINT "trucking_document_source_check" CHECK ("trucking_document"."source" IN ('USER', 'HAULIER'))
);
--> statement-breakpoint
CREATE TABLE "trucking_haulier_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "trucking_haulier_link_hash_check" CHECK ("trucking_haulier_link"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "trucking_leg" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"consignment_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"seq" integer DEFAULT 1 NOT NULL,
	"kind" text DEFAULT 'DIRECT' NOT NULL,
	CONSTRAINT "trucking_leg_kind_check" CHECK ("trucking_leg"."kind" IN ('DIRECT'))
);
--> statement-breakpoint
CREATE TABLE "trucking_ref_counter" (
	"company_id" uuid NOT NULL,
	"sequence" text NOT NULL,
	"year" integer NOT NULL,
	"last" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trucking_ref_counter_company_id_sequence_year_pk" PRIMARY KEY("company_id","sequence","year"),
	CONSTRAINT "trucking_ref_counter_sequence_check" CHECK ("trucking_ref_counter"."sequence" IN ('TCZ', 'LCZ'))
);
--> statement-breakpoint
CREATE TABLE "trucking_trip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"kind" text DEFAULT 'FTL' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"haulier_customer_id" uuid NOT NULL,
	"haulier_name" text DEFAULT '' NOT NULL,
	"suggested_haulier_id" uuid,
	"vehicle_type_code" text,
	"tractor_plate" text DEFAULT '' NOT NULL,
	"trailer_plate" text DEFAULT '' NOT NULL,
	"driver_name" text DEFAULT '' NOT NULL,
	"driver_phone" text DEFAULT '' NOT NULL,
	"planned_pickup_date" date NOT NULL,
	"buy" jsonb,
	"buy_czk" numeric(14, 2),
	"buy_candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"order_sent_at" timestamp with time zone,
	"order_sent_by" text,
	"order_sent_by_user_id" uuid,
	"order_sent_by_role" text,
	"order_recorded_only" boolean DEFAULT false NOT NULL,
	"order_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pin_printed" boolean DEFAULT false NOT NULL,
	"our_company_name" text DEFAULT '' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_via" text,
	"confirmed_by" text,
	"rejected_at" timestamp with time zone,
	"reject_reason" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"cancel_reason" text,
	"created_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "trucking_trip_kind_check" CHECK ("trucking_trip"."kind" IN ('FTL')),
	CONSTRAINT "trucking_trip_status_check" CHECK ("trucking_trip"."status" IN ('DRAFT', 'ORDERED', 'CONFIRMED', 'IN_TRANSIT', 'DONE', 'CANCELLED')),
	CONSTRAINT "trucking_trip_confirmed_via_check" CHECK ("trucking_trip"."confirmed_via" IS NULL OR "trucking_trip"."confirmed_via" IN ('LINK', 'USER')),
	CONSTRAINT "trucking_trip_ref_check" CHECK ("trucking_trip"."ref" ~ '^LCZ[0-9]{10}$')
);
--> statement-breakpoint
CREATE TABLE "trucking_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"consignment_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"acting_user_id" text NOT NULL,
	"acting_role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "trucking_outbox_kind_check" CHECK ("trucking_outbox"."kind" IN ('planned', 'plate', 'delivered', 'billing', 'costs')),
	CONSTRAINT "trucking_outbox_status_check" CHECK ("trucking_outbox"."status" IN ('pending', 'sent', 'failed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "trucking_event" ADD COLUMN "consignment_id" uuid;--> statement-breakpoint
ALTER TABLE "trucking_event" ADD COLUMN "trip_id" uuid;--> statement-breakpoint
ALTER TABLE "trucking_document" ADD CONSTRAINT "trucking_document_consignment_fk" FOREIGN KEY ("consignment_id") REFERENCES "public"."trucking_consignment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucking_haulier_link" ADD CONSTRAINT "trucking_haulier_link_trip_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trucking_trip"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucking_leg" ADD CONSTRAINT "trucking_leg_consignment_fk" FOREIGN KEY ("consignment_id") REFERENCES "public"."trucking_consignment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucking_leg" ADD CONSTRAINT "trucking_leg_trip_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trucking_trip"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trucking_consignment_created_at_idx" ON "trucking_consignment" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trucking_consignment_deleted_at_idx" ON "trucking_consignment" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "trucking_consignment_company_id_idx" ON "trucking_consignment" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_consignment_ref_unique" ON "trucking_consignment" USING btree ("company_id","ref");--> statement-breakpoint
CREATE INDEX "trucking_consignment_shipment_idx" ON "trucking_consignment" USING btree ("company_id","shipment_id");--> statement-breakpoint
CREATE INDEX "trucking_consignment_status_idx" ON "trucking_consignment" USING btree ("company_id","status","pickup_date");--> statement-breakpoint
CREATE INDEX "trucking_consignment_trip_idx" ON "trucking_consignment" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "trucking_document_created_at_idx" ON "trucking_document" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trucking_document_deleted_at_idx" ON "trucking_document" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "trucking_document_company_id_idx" ON "trucking_document" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "trucking_document_consignment_idx" ON "trucking_document" USING btree ("consignment_id");--> statement-breakpoint
CREATE INDEX "trucking_haulier_link_created_at_idx" ON "trucking_haulier_link" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trucking_haulier_link_deleted_at_idx" ON "trucking_haulier_link" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "trucking_haulier_link_company_id_idx" ON "trucking_haulier_link" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_haulier_link_token_unique" ON "trucking_haulier_link" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "trucking_haulier_link_trip_idx" ON "trucking_haulier_link" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "trucking_leg_created_at_idx" ON "trucking_leg" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trucking_leg_deleted_at_idx" ON "trucking_leg" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "trucking_leg_company_id_idx" ON "trucking_leg" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "trucking_leg_consignment_idx" ON "trucking_leg" USING btree ("consignment_id");--> statement-breakpoint
CREATE INDEX "trucking_leg_trip_idx" ON "trucking_leg" USING btree ("trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_leg_live_unique" ON "trucking_leg" USING btree ("consignment_id","seq") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "trucking_trip_created_at_idx" ON "trucking_trip" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trucking_trip_deleted_at_idx" ON "trucking_trip" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "trucking_trip_company_id_idx" ON "trucking_trip" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_trip_ref_unique" ON "trucking_trip" USING btree ("company_id","ref");--> statement-breakpoint
CREATE INDEX "trucking_trip_status_idx" ON "trucking_trip" USING btree ("company_id","status","planned_pickup_date");--> statement-breakpoint
CREATE INDEX "trucking_outbox_created_at_idx" ON "trucking_outbox" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trucking_outbox_deleted_at_idx" ON "trucking_outbox" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "trucking_outbox_company_id_idx" ON "trucking_outbox" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "trucking_outbox_due_idx" ON "trucking_outbox" USING btree ("next_attempt_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "trucking_outbox_shipment_idx" ON "trucking_outbox" USING btree ("shipment_id","created_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "trucking_outbox_consignment_idx" ON "trucking_outbox" USING btree ("consignment_id");--> statement-breakpoint
CREATE INDEX "trucking_event_consignment_idx" ON "trucking_event" USING btree ("consignment_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "trucking_event_trip_idx" ON "trucking_event" USING btree ("trip_id","at" DESC NULLS LAST);--> statement-breakpoint
-- Hand-added: a trip has at most one live haulier link (a renewed link revokes the old one first).
CREATE UNIQUE INDEX "trucking_haulier_link_one_live" ON "trucking_haulier_link" USING btree ("trip_id") WHERE revoked_at IS NULL AND deleted_at IS NULL;
