CREATE TABLE "trucking_gate_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid,
	"position_id" text NOT NULL,
	"wcz_ref" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"stamp_kind" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"user_id" text DEFAULT '' NOT NULL,
	CONSTRAINT "trucking_gate_event_kind_check" CHECK ("trucking_gate_event"."kind" IN ('gateIn', 'gateOut', 'voided'))
);
--> statement-breakpoint
ALTER TABLE "trucking_consignment" DROP CONSTRAINT "trucking_consignment_scope_check";--> statement-breakpoint
ALTER TABLE "trucking_consignment" DROP CONSTRAINT "trucking_consignment_status_check";--> statement-breakpoint
ALTER TABLE "trucking_consignment" DROP CONSTRAINT "trucking_consignment_stamp_order_check";--> statement-breakpoint
ALTER TABLE "trucking_leg" DROP CONSTRAINT "trucking_leg_kind_check";--> statement-breakpoint
ALTER TABLE "trucking_trip" DROP CONSTRAINT "trucking_trip_kind_check";--> statement-breakpoint
ALTER TABLE "trucking_outbox" DROP CONSTRAINT "trucking_outbox_kind_check";--> statement-breakpoint
ALTER TABLE "trucking_leg" ALTER COLUMN "trip_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trucking_consignment" ADD COLUMN "self_delivered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trucking_consignment" ADD COLUMN "last_mile" text;--> statement-breakpoint
ALTER TABLE "trucking_consignment" ADD COLUMN "partner_haulier_customer_id" uuid;--> statement-breakpoint
ALTER TABLE "trucking_consignment" ADD COLUMN "gate_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trucking_consignment" ADD COLUMN "gate_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trucking_consignment" ADD COLUMN "promised_final" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trucking_leg" ADD COLUMN "status" text DEFAULT 'OPEN' NOT NULL;--> statement-breakpoint
-- Hand-added: the Phase 4 FTL legs are on their trips (planned).
UPDATE "trucking_leg" SET "status" = 'PLANNED' WHERE "trip_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "trucking_leg" ADD COLUMN "from_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "trucking_leg" ADD COLUMN "to_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "trucking_leg" ADD COLUMN "from_postcode" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "trucking_leg" ADD COLUMN "to_postcode" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "trucking_leg" ADD COLUMN "haulier_customer_id" uuid;--> statement-breakpoint
ALTER TABLE "trucking_leg" ADD COLUMN "depot_site_id" uuid;--> statement-breakpoint
ALTER TABLE "trucking_leg" ADD COLUMN "buy" jsonb;--> statement-breakpoint
ALTER TABLE "trucking_leg" ADD COLUMN "cost_share_czk" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "trucking_trip" ADD COLUMN "stop_order" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trucking_trip" ADD COLUMN "departed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trucking_trip" ADD COLUMN "departed_by" text;--> statement-breakpoint
ALTER TABLE "trucking_trip" ADD COLUMN "arrived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trucking_trip" ADD COLUMN "arrived_by" text;--> statement-breakpoint
ALTER TABLE "trucking_trip" ADD COLUMN "cost_jobs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trucking_trip" ADD COLUMN "warehouse_jobs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trucking_settings" ADD COLUMN "hub" jsonb DEFAULT '{"name":"","street":"","postcode":"","city":"","country":"CZ"}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "trucking_gate_event_created_at_idx" ON "trucking_gate_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trucking_gate_event_deleted_at_idx" ON "trucking_gate_event" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "trucking_gate_event_company_id_idx" ON "trucking_gate_event" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_gate_event_unique" ON "trucking_gate_event" USING btree ("company_id","position_id","kind","at");--> statement-breakpoint
ALTER TABLE "trucking_consignment" ADD CONSTRAINT "trucking_consignment_last_mile_check" CHECK ("trucking_consignment"."last_mile" IS NULL OR "trucking_consignment"."last_mile" IN ('OWN_RUN', 'PARTNER'));--> statement-breakpoint
ALTER TABLE "trucking_consignment" ADD CONSTRAINT "trucking_consignment_scope_check" CHECK ("trucking_consignment"."scope" IN ('FTL', 'LTL'));--> statement-breakpoint
ALTER TABLE "trucking_consignment" ADD CONSTRAINT "trucking_consignment_status_check" CHECK ("trucking_consignment"."status" IN ('BOOKED', 'PLANNED', 'ORDERED', 'CONFIRMED', 'PICKED_UP', 'AT_HUB', 'ON_LINEHAUL', 'OUT_FOR_DELIVERY', 'DELIVERED', 'POD_RECEIVED', 'READY_TO_BILL', 'CANCELLED'));--> statement-breakpoint
ALTER TABLE "trucking_consignment" ADD CONSTRAINT "trucking_consignment_stamp_order_check" CHECK (("trucking_consignment"."delivered_at" IS NULL OR "trucking_consignment"."picked_up_at" IS NOT NULL OR "trucking_consignment"."gate_in_at" IS NOT NULL) AND ("trucking_consignment"."pod_received_at" IS NULL OR "trucking_consignment"."delivered_at" IS NOT NULL) AND ("trucking_consignment"."ready_to_bill_at" IS NULL OR "trucking_consignment"."pod_received_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "trucking_leg" ADD CONSTRAINT "trucking_leg_status_check" CHECK ("trucking_leg"."status" IN ('OPEN', 'PLANNED', 'DONE'));--> statement-breakpoint
ALTER TABLE "trucking_leg" ADD CONSTRAINT "trucking_leg_trip_check" CHECK ("trucking_leg"."trip_id" IS NULL OR "trucking_leg"."status" <> 'OPEN');--> statement-breakpoint
ALTER TABLE "trucking_leg" ADD CONSTRAINT "trucking_leg_kind_check" CHECK ("trucking_leg"."kind" IN ('DIRECT', 'PICKUP', 'LINEHAUL', 'DELIVERY'));--> statement-breakpoint
ALTER TABLE "trucking_trip" ADD CONSTRAINT "trucking_trip_kind_check" CHECK ("trucking_trip"."kind" IN ('FTL', 'PICKUP_RUN', 'LINEHAUL', 'DELIVERY_RUN'));--> statement-breakpoint
ALTER TABLE "trucking_outbox" ADD CONSTRAINT "trucking_outbox_kind_check" CHECK ("trucking_outbox"."kind" IN ('planned', 'plate', 'delivered', 'billing', 'costs', 'expect_arrival', 'expect_departure', 'cancel_expected'));