CREATE TABLE "shipment_import_instruction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"prefill" jsonb NOT NULL,
	"answers" jsonb,
	"created_by" text DEFAULT '' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"decided_by" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone,
	"reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "shipment_import_instruction_status_check" CHECK ("shipment_import_instruction"."status" IN ('open', 'submitted', 'approved', 'rejected', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_import_instruction_token_idx" ON "shipment_import_instruction" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "shipment_import_instruction_shipment_idx" ON "shipment_import_instruction" USING btree ("shipment_id","created_at");--> statement-breakpoint
CREATE INDEX "shipment_import_instruction_waiting_idx" ON "shipment_import_instruction" USING btree ("company_id","created_by_user_id","status");