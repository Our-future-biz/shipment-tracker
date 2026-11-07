CREATE TABLE "selling_amount_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"job_number" text DEFAULT '' NOT NULL,
	"selling_cost_id" uuid NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"currency" text NOT NULL,
	"cost_amount" numeric(14, 2) NOT NULL,
	"current_amount" numeric(14, 2),
	"requested_amount" numeric(14, 2) NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"requested_by_name" text DEFAULT '' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_id" uuid,
	"decided_by_name" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone,
	"comment" text DEFAULT '' NOT NULL,
	"self_decision" boolean DEFAULT false NOT NULL,
	CONSTRAINT "selling_amount_request_status_check" CHECK ("selling_amount_request"."status" IN ('pending', 'approved', 'rejected', 'withdrawn'))
);
--> statement-breakpoint
ALTER TABLE "invoice_selling_cost" ADD COLUMN "amount_override_cost" numeric(14, 2);--> statement-breakpoint
CREATE INDEX "selling_amount_request_company_id_idx" ON "selling_amount_request" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "selling_amount_request_company_status_idx" ON "selling_amount_request" USING btree ("company_id","status","requested_at");--> statement-breakpoint
CREATE INDEX "selling_amount_request_company_shipment_idx" ON "selling_amount_request" USING btree ("company_id","shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "selling_amount_request_pending_unique" ON "selling_amount_request" USING btree ("selling_cost_id") WHERE status = 'pending' AND deleted_at IS NULL;