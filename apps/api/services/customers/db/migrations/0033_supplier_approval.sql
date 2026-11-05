-- A new supplier added from a quote by a user who is no manager waits for a manager (Sales → Managers →
-- Company approval). Every existing company gets '' (nothing to approve). Safe to run again: the local
-- databases are shared by every branch.
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "approval_status" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "approval_requested_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "approval_requested_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "approval_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "approval_quote_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "approval_decision" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "approval_decided_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "approval_decided_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "approval_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "approval_comment" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "approval_answer_seen_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_approval_idx" ON "customer" USING btree ("company_id","approval_requested_at") WHERE approval_requested_at IS NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" DROP CONSTRAINT IF EXISTS "customer_approval_status_check";--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_approval_status_check" CHECK ("customer"."approval_status" IN ('', 'pending', 'declined'));--> statement-breakpoint
ALTER TABLE "customer" DROP CONSTRAINT IF EXISTS "customer_approval_decision_check";--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_approval_decision_check" CHECK ("customer"."approval_decision" IN ('', 'approved', 'declined'));
