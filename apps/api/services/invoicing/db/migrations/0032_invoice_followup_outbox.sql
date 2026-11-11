CREATE TABLE "invoice_followup_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
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
	CONSTRAINT "invoice_followup_outbox_kind_check" CHECK ("invoice_followup_outbox"."kind" IN ('customer_invoice', 'mark_credited', 'status_after_issue', 'status_after_credit')),
	CONSTRAINT "invoice_followup_outbox_status_check" CHECK ("invoice_followup_outbox"."status" IN ('pending', 'sent', 'failed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "invoice_followup_outbox" ADD CONSTRAINT "invoice_followup_outbox_invoice_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_followup_outbox_company_id_idx" ON "invoice_followup_outbox" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "invoice_followup_outbox_due_idx" ON "invoice_followup_outbox" USING btree ("next_attempt_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "invoice_followup_outbox_invoice_idx" ON "invoice_followup_outbox" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "invoice_followup_outbox_shipment_idx" ON "invoice_followup_outbox" USING btree ("shipment_id","created_at");