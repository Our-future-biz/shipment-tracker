-- Trucking Phase 6: avizace and delivery exceptions, haulier invoices with the VAT bank-account
-- check, and monthly internal billing to other departments (ledger, closed months, statements).
CREATE TABLE "trucking_exception" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"consignment_id" uuid NOT NULL,
	"leg_id" uuid,
	"kind" text NOT NULL,
	"failed_reason" text,
	"cause" text DEFAULT 'UNKNOWN' NOT NULL,
	"decision" text DEFAULT 'PENDING' NOT NULL,
	"amount" numeric(14, 2),
	"currency" text DEFAULT 'CZK' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"pieces" integer,
	"waiting_minutes" integer,
	"warehouse_exception_id" uuid,
	"created_by_user_id" uuid,
	"created_by" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"decision_reason" text,
	"claim_target_kind" text,
	"claim_target_id" uuid,
	"claim_haulier_customer_id" uuid,
	"closed_at" timestamp with time zone,
	"closed_by" text,
	"close_note" text,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "trucking_exception_kind_check" CHECK ("trucking_exception"."kind" IN ('FAILED_DELIVERY', 'DAMAGE', 'SHORTAGE', 'OVERAGE', 'WAITING_TIME', 'REDELIVERY', 'OTHER')),
	CONSTRAINT "trucking_exception_failed_reason_check" CHECK ("trucking_exception"."failed_reason" IS NULL OR "trucking_exception"."failed_reason" IN ('CLOSED', 'ABSENT', 'REFUSED', 'WRONG_ADDRESS', 'REFUSED_DAMAGED', 'NO_AVIZACE', 'OTHER')),
	CONSTRAINT "trucking_exception_cause_check" CHECK ("trucking_exception"."cause" IN ('CUSTOMER', 'HAULIER', 'US', 'UNKNOWN')),
	CONSTRAINT "trucking_exception_decision_check" CHECK ("trucking_exception"."decision" IN ('CHARGE_CUSTOMER', 'CLAIM_HAULIER', 'ABSORB', 'PENDING')),
	CONSTRAINT "trucking_exception_currency_check" CHECK ("trucking_exception"."currency" IN ('CZK', 'EUR')),
	CONSTRAINT "trucking_exception_claim_kind_check" CHECK ("trucking_exception"."claim_target_kind" IS NULL OR "trucking_exception"."claim_target_kind" IN ('TRIP', 'PARTNER_LEG')),
	CONSTRAINT "trucking_exception_amount_check" CHECK ("trucking_exception"."decision" NOT IN ('CHARGE_CUSTOMER', 'CLAIM_HAULIER') OR "trucking_exception"."amount" > 0),
	CONSTRAINT "trucking_exception_closed_check" CHECK ("trucking_exception"."closed_at" IS NULL OR "trucking_exception"."decision" <> 'PENDING')
);
--> statement-breakpoint
CREATE TABLE "trucking_haulier_invoice_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"target_ref" text DEFAULT '' NOT NULL,
	"expected" numeric(14, 2) NOT NULL,
	"claimed" numeric(14, 2) DEFAULT 0 NOT NULL,
	"invoiced" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"live" boolean DEFAULT true NOT NULL,
	"allocations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "trucking_haulier_invoice_line_kind_check" CHECK ("trucking_haulier_invoice_line"."target_kind" IN ('TRIP', 'PARTNER_LEG')),
	CONSTRAINT "trucking_haulier_invoice_line_currency_check" CHECK ("trucking_haulier_invoice_line"."currency" IN ('CZK', 'EUR'))
);
--> statement-breakpoint
CREATE TABLE "trucking_haulier_invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"haulier_customer_id" uuid NOT NULL,
	"haulier_name" text DEFAULT '' NOT NULL,
	"invoice_number" text NOT NULL,
	"invoice_number_key" text NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date,
	"duzp" date,
	"currency" text NOT NULL,
	"total_net" numeric(14, 2) NOT NULL,
	"vat_amount" numeric(14, 2) NOT NULL,
	"total_gross" numeric(14, 2) NOT NULL,
	"bank_account" text NOT NULL,
	"bank_account_published" boolean,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"block_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"difference" numeric(14, 2) DEFAULT 0 NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"approved_by" text,
	"approval_reason" text,
	"rejected_at" timestamp with time zone,
	"rejected_by_user_id" uuid,
	"rejected_by" text,
	"reject_reason" text,
	"file_name" text,
	"file_content_type" text,
	"file_size_bytes" integer,
	"file_sha256" text,
	"file_storage_key" text,
	"created_by_user_id" uuid,
	"created_by" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "trucking_haulier_invoice_status_check" CHECK ("trucking_haulier_invoice"."status" IN ('DRAFT', 'MATCHED', 'NEEDS_APPROVAL', 'APPROVED', 'BLOCKED', 'REJECTED')),
	CONSTRAINT "trucking_haulier_invoice_currency_check" CHECK ("trucking_haulier_invoice"."currency" IN ('CZK', 'EUR')),
	CONSTRAINT "trucking_haulier_invoice_approved_check" CHECK ("trucking_haulier_invoice"."status" <> 'APPROVED' OR ("trucking_haulier_invoice"."approved_at" IS NOT NULL AND "trucking_haulier_invoice"."block_reasons" = '[]'::jsonb)),
	CONSTRAINT "trucking_haulier_invoice_rejected_check" CHECK (("trucking_haulier_invoice"."status" = 'REJECTED') = ("trucking_haulier_invoice"."rejected_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "trucking_internal_charge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"month" text NOT NULL,
	"consignment_id" uuid NOT NULL,
	"consignment_ref" text NOT NULL,
	"shipment_id" uuid NOT NULL,
	"job_number" text DEFAULT '' NOT NULL,
	"department" text NOT NULL,
	"delivered_at" timestamp with time zone NOT NULL,
	"service_level" text,
	"chargeable_kg" numeric(12, 2),
	"tariff_version_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'CZK' NOT NULL,
	"kind" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"not_priced" boolean DEFAULT false NOT NULL,
	"exception_id" uuid,
	"reverses_id" uuid,
	"created_by" text DEFAULT '' NOT NULL,
	CONSTRAINT "trucking_internal_charge_month_check" CHECK ("trucking_internal_charge"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "trucking_internal_charge_kind_check" CHECK ("trucking_internal_charge"."kind" IN ('CHARGE', 'EXCEPTION', 'ADJUSTMENT')),
	CONSTRAINT "trucking_internal_charge_currency_check" CHECK ("trucking_internal_charge"."currency" = 'CZK'),
	CONSTRAINT "trucking_internal_charge_not_priced_check" CHECK (NOT "trucking_internal_charge"."not_priced" OR "trucking_internal_charge"."amount" = 0)
);
--> statement-breakpoint
CREATE TABLE "trucking_internal_month" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"month" text NOT NULL,
	"status" text DEFAULT 'CLOSED' NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" text DEFAULT '' NOT NULL,
	"closed_by_user_id" uuid,
	CONSTRAINT "trucking_internal_month_month_check" CHECK ("trucking_internal_month"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "trucking_internal_month_status_check" CHECK ("trucking_internal_month"."status" = 'CLOSED')
);
--> statement-breakpoint
CREATE TABLE "trucking_internal_statement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"number" text NOT NULL,
	"month" text NOT NULL,
	"department" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by" text DEFAULT '' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"line_count" integer NOT NULL,
	CONSTRAINT "trucking_internal_statement_number_check" CHECK ("trucking_internal_statement"."number" ~ '^ICZ[0-9]{8}$')
);
--> statement-breakpoint
ALTER TABLE "trucking_ref_counter" DROP CONSTRAINT "trucking_ref_counter_sequence_check";--> statement-breakpoint
ALTER TABLE "trucking_outbox" DROP CONSTRAINT "trucking_outbox_kind_check";--> statement-breakpoint
ALTER TABLE "trucking_consignment" ADD COLUMN "department" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "trucking_consignment" ADD COLUMN "internal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trucking_consignment" ADD COLUMN "avizace" jsonb;--> statement-breakpoint
ALTER TABLE "trucking_haulier_profile" ADD COLUMN "bank_accounts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trucking_settings" ADD COLUMN "waiting_free_time" jsonb DEFAULT '{"ltlMinutes":30,"ftlMinutes":120}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trucking_exception" ADD CONSTRAINT "trucking_exception_consignment_fk" FOREIGN KEY ("consignment_id") REFERENCES "public"."trucking_consignment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucking_exception" ADD CONSTRAINT "trucking_exception_leg_fk" FOREIGN KEY ("leg_id") REFERENCES "public"."trucking_leg"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucking_haulier_invoice_line" ADD CONSTRAINT "trucking_haulier_invoice_line_invoice_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."trucking_haulier_invoice"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucking_internal_charge" ADD CONSTRAINT "trucking_internal_charge_consignment_fk" FOREIGN KEY ("consignment_id") REFERENCES "public"."trucking_consignment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucking_internal_charge" ADD CONSTRAINT "trucking_internal_charge_reverses_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."trucking_internal_charge"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trucking_exception_created_at_idx" ON "trucking_exception" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trucking_exception_deleted_at_idx" ON "trucking_exception" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "trucking_exception_company_id_idx" ON "trucking_exception" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "trucking_exception_consignment_idx" ON "trucking_exception" USING btree ("consignment_id");--> statement-breakpoint
CREATE INDEX "trucking_exception_open_idx" ON "trucking_exception" USING btree ("company_id","consignment_id") WHERE closed_at IS NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "trucking_exception_claim_idx" ON "trucking_exception" USING btree ("company_id","claim_target_id") WHERE claim_target_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "trucking_haulier_invoice_line_created_at_idx" ON "trucking_haulier_invoice_line" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trucking_haulier_invoice_line_deleted_at_idx" ON "trucking_haulier_invoice_line" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "trucking_haulier_invoice_line_company_id_idx" ON "trucking_haulier_invoice_line" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "trucking_haulier_invoice_line_invoice_idx" ON "trucking_haulier_invoice_line" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_haulier_invoice_line_target_unique" ON "trucking_haulier_invoice_line" USING btree ("company_id","target_kind","target_id") WHERE deleted_at IS NULL AND live;--> statement-breakpoint
CREATE INDEX "trucking_haulier_invoice_created_at_idx" ON "trucking_haulier_invoice" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trucking_haulier_invoice_deleted_at_idx" ON "trucking_haulier_invoice" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "trucking_haulier_invoice_company_id_idx" ON "trucking_haulier_invoice" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_haulier_invoice_number_unique" ON "trucking_haulier_invoice" USING btree ("company_id","haulier_customer_id","invoice_number_key") WHERE deleted_at IS NULL AND status <> 'REJECTED';--> statement-breakpoint
CREATE INDEX "trucking_haulier_invoice_haulier_idx" ON "trucking_haulier_invoice" USING btree ("company_id","haulier_customer_id","issue_date");--> statement-breakpoint
CREATE INDEX "trucking_haulier_invoice_status_idx" ON "trucking_haulier_invoice" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "trucking_internal_charge_company_id_idx" ON "trucking_internal_charge" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "trucking_internal_charge_month_idx" ON "trucking_internal_charge" USING btree ("company_id","month","department");--> statement-breakpoint
CREATE INDEX "trucking_internal_charge_consignment_idx" ON "trucking_internal_charge" USING btree ("company_id","consignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_internal_charge_reverses_unique" ON "trucking_internal_charge" USING btree ("reverses_id") WHERE reverses_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "trucking_internal_month_company_id_idx" ON "trucking_internal_month" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_internal_month_unique" ON "trucking_internal_month" USING btree ("company_id","month");--> statement-breakpoint
CREATE INDEX "trucking_internal_statement_company_id_idx" ON "trucking_internal_statement" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_internal_statement_number_unique" ON "trucking_internal_statement" USING btree ("company_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_internal_statement_month_unique" ON "trucking_internal_statement" USING btree ("company_id","month","department");--> statement-breakpoint
ALTER TABLE "trucking_ref_counter" ADD CONSTRAINT "trucking_ref_counter_sequence_check" CHECK ("trucking_ref_counter"."sequence" IN ('TCZ', 'LCZ', 'ICZ'));--> statement-breakpoint
ALTER TABLE "trucking_outbox" ADD CONSTRAINT "trucking_outbox_kind_check" CHECK ("trucking_outbox"."kind" IN ('planned', 'plate', 'delivered', 'billing', 'costs', 'expect_arrival', 'expect_departure', 'cancel_expected', 'real_costs'));
--> statement-breakpoint
-- Internal billing is a ledger: charges are never updated or deleted (a correction is a new ADJUSTMENT).
CREATE OR REPLACE FUNCTION trucking_internal_charge_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'trucking_internal_charge is append-only: write an ADJUSTMENT instead';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER trucking_internal_charge_no_update
  BEFORE UPDATE OR DELETE ON trucking_internal_charge
  FOR EACH ROW EXECUTE FUNCTION trucking_internal_charge_append_only();--> statement-breakpoint
-- A closed month never changes: nothing is written into it (a later correction goes into an open month).
CREATE OR REPLACE FUNCTION trucking_internal_charge_open_month() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM trucking_internal_month m WHERE m.company_id = NEW.company_id AND m.month = NEW.month) THEN
    RAISE EXCEPTION 'internal billing month % is closed: write an ADJUSTMENT into an open month', NEW.month;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER trucking_internal_charge_closed_month
  BEFORE INSERT ON trucking_internal_charge
  FOR EACH ROW EXECUTE FUNCTION trucking_internal_charge_open_month();--> statement-breakpoint
-- A closed month is never reopened and an issued internal statement never changes.
CREATE OR REPLACE FUNCTION trucking_internal_closed_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows never change once written', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER trucking_internal_month_immutable
  BEFORE UPDATE OR DELETE ON trucking_internal_month
  FOR EACH ROW EXECUTE FUNCTION trucking_internal_closed_immutable();--> statement-breakpoint
CREATE TRIGGER trucking_internal_statement_immutable
  BEFORE UPDATE OR DELETE ON trucking_internal_statement
  FOR EACH ROW EXECUTE FUNCTION trucking_internal_closed_immutable();
