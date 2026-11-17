CREATE TABLE "invoice_change_request" (
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
	"gross" numeric(14, 2) NOT NULL,
	"issue_date" date NOT NULL,
	"fixes" jsonb NOT NULL,
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
	CONSTRAINT "invoice_change_request_status_check" CHECK ("invoice_change_request"."status" IN ('pending', 'approved', 'rejected', 'withdrawn', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "invoice" DROP CONSTRAINT "invoice_status_check";--> statement-breakpoint
ALTER TABLE "invoice_change_request" ADD CONSTRAINT "invoice_change_request_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_change_request_company_id_idx" ON "invoice_change_request" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "invoice_change_request_company_status_idx" ON "invoice_change_request" USING btree ("company_id","status","requested_at");--> statement-breakpoint
CREATE INDEX "invoice_change_request_company_shipment_idx" ON "invoice_change_request" USING btree ("company_id","shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_change_request_pending_unique" ON "invoice_change_request" USING btree ("invoice_id") WHERE status = 'pending' AND deleted_at IS NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_status_check" CHECK ("invoice"."status" IN ('issued', 'credited', 'cancelled'));--> statement-breakpoint
-- An issued invoice may also be cancelled: withdrawn on its issue day with a manager's approval
-- (services/invoiceChangeRequest), kept on record as it was. Its content stays as immutable as before.
CREATE OR REPLACE FUNCTION invoice_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Issued invoice % cannot be deleted - issue a credit note instead', OLD.number;
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'pdf_key' - 'pdf_sha256' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'pdf_key' - 'pdf_sha256' - 'updated_at') THEN
    RAISE EXCEPTION 'Issued invoice % cannot be changed - issue a credit note instead', OLD.number;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status = 'issued' AND NEW.status = 'credited')
     AND NOT (OLD.status = 'issued' AND NEW.status = 'cancelled' AND OLD.kind = 'invoice') THEN
    RAISE EXCEPTION 'Invoice % cannot change status from % to %', OLD.number, OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
