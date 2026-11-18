-- Finance → Accounts Receivable (Council Outlay 10, 18 Nov 2026): what customers paid on an issued invoice, the
-- chasing, the history and which bell notices a user has seen - records of their own beside the invoice, which stays
-- as issued (it is locked by a trigger, 0011 and 0034). A receivable is made by the app when an invoice is first read,
-- not here; the old "Paid" marks of the customer's list are carried over by the app too. Safe to run again.
CREATE TABLE IF NOT EXISTS "receivable_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"action" text NOT NULL,
	"from_status" text DEFAULT '' NOT NULL,
	"to_status" text DEFAULT '' NOT NULL,
	"by_user_id" uuid,
	"by" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "receivable_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"promised_on" date,
	"reminder_level" smallint,
	"recipient" text DEFAULT '' NOT NULL,
	"by_user_id" uuid,
	"by" text DEFAULT '' NOT NULL,
	CONSTRAINT "receivable_note_kind_check" CHECK ("receivable_note"."kind" IN ('note', 'promise', 'dispute', 'dispute_closed', 'reminder')),
	CONSTRAINT "receivable_note_reminder_check" CHECK ("receivable_note"."kind" <> 'reminder' OR "receivable_note"."reminder_level" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "receivable_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text DEFAULT 'payment' NOT NULL,
	"paid_on" date,
	"amount" numeric(14, 2) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"by_user_id" uuid,
	"by" text DEFAULT '' NOT NULL,
	"idempotency_key" text,
	"taken_back_at" timestamp with time zone,
	"taken_back_by_user_id" uuid,
	"taken_back_by" text DEFAULT '' NOT NULL,
	"taken_back_reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "receivable_payment_kind_check" CHECK ("receivable_payment"."kind" IN ('payment', 'carried_over')),
	CONSTRAINT "receivable_payment_amount_check" CHECK ("receivable_payment"."amount" > 0),
	CONSTRAINT "receivable_payment_paid_on_check" CHECK ("receivable_payment"."paid_on" IS NOT NULL OR "receivable_payment"."kind" = 'carried_over')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "receivable_seen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"milestone" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "receivable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"paid_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"last_paid_on" date,
	"promised_on" date,
	"disputed" boolean DEFAULT false NOT NULL,
	"disputed_reason" text DEFAULT '' NOT NULL,
	"reminder_level" smallint DEFAULT 0 NOT NULL,
	"last_reminded_on" date,
	"carried_checked" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "receivable_reminder_level_check" CHECK ("receivable"."reminder_level" BETWEEN 0 AND 3)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "receivable_event" ADD CONSTRAINT "receivable_event_invoice_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "receivable_note" ADD CONSTRAINT "receivable_note_invoice_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "receivable_payment" ADD CONSTRAINT "receivable_payment_invoice_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "receivable_seen" ADD CONSTRAINT "receivable_seen_invoice_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "receivable" ADD CONSTRAINT "receivable_invoice_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receivable_event_company_id_idx" ON "receivable_event" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receivable_event_invoice_idx" ON "receivable_event" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receivable_note_company_id_idx" ON "receivable_note" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receivable_note_invoice_idx" ON "receivable_note" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receivable_payment_company_id_idx" ON "receivable_payment" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receivable_payment_invoice_idx" ON "receivable_payment" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "receivable_payment_idempotency_unique" ON "receivable_payment" USING btree ("company_id","idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "receivable_payment_carried_unique" ON "receivable_payment" USING btree ("invoice_id") WHERE kind = 'carried_over';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receivable_seen_company_id_idx" ON "receivable_seen" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "receivable_seen_unique" ON "receivable_seen" USING btree ("company_id","user_id","invoice_id","milestone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receivable_company_id_idx" ON "receivable" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "receivable_invoice_unique" ON "receivable" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_receivable_idx" ON "invoice" USING btree ("company_id","kind","status","due_date") WHERE deleted_at IS NULL;--> statement-breakpoint
-- The outbox takes the new kind: its check is dropped and made again with it.
ALTER TABLE "invoice_followup_outbox" DROP CONSTRAINT IF EXISTS "invoice_followup_outbox_kind_check";--> statement-breakpoint
ALTER TABLE "invoice_followup_outbox" ADD CONSTRAINT "invoice_followup_outbox_kind_check" CHECK ("invoice_followup_outbox"."kind" IN ('customer_invoice', 'mark_credited', 'status_after_issue', 'status_after_credit', 'receivable_state'));
