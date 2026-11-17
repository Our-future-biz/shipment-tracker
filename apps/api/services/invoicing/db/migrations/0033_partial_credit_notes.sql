CREATE TABLE "credit_note_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"job_number" text DEFAULT '' NOT NULL,
	"invoice_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"currency" text NOT NULL,
	"lines" jsonb NOT NULL,
	"net" numeric(14, 2) NOT NULL,
	"vat" numeric(14, 2) NOT NULL,
	"gross" numeric(14, 2) NOT NULL,
	"invoice_gross" numeric(14, 2) NOT NULL,
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
	"answer_seen_at" timestamp with time zone,
	"credit_note_id" uuid,
	"credit_note_number" text DEFAULT '' NOT NULL,
	CONSTRAINT "credit_note_request_status_check" CHECK ("credit_note_request"."status" IN ('pending', 'approved', 'rejected', 'withdrawn'))
);
--> statement-breakpoint
ALTER TABLE "invoice_line" ADD COLUMN "corrects_line_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_selling_cost" ADD COLUMN "source_credit_note_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_note_request" ADD CONSTRAINT "credit_note_request_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_note_request_company_id_idx" ON "credit_note_request" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_note_request_company_status_idx" ON "credit_note_request" USING btree ("company_id","status","requested_at");--> statement-breakpoint
CREATE INDEX "credit_note_request_company_shipment_idx" ON "credit_note_request" USING btree ("company_id","shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_note_request_pending_unique" ON "credit_note_request" USING btree ("invoice_id") WHERE status = 'pending' AND deleted_at IS NULL;