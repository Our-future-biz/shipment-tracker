ALTER TABLE "customer" ADD COLUMN "approval_status" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "approval_requested_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "approval_requested_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "approval_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "approval_quote_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "approval_decision" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "approval_decided_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "approval_decided_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "approval_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "approval_comment" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "approval_answer_seen_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "customer_approval_idx" ON "customer" USING btree ("company_id","approval_requested_at") WHERE approval_requested_at IS NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_approval_status_check" CHECK ("customer"."approval_status" IN ('', 'pending', 'declined'));--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_approval_decision_check" CHECK ("customer"."approval_decision" IN ('', 'approved', 'declined'));