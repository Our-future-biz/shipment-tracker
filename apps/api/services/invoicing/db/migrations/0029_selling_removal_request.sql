ALTER TABLE "invoice_selling_cost" ADD COLUMN "waived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "selling_amount_request" ADD COLUMN "kind" text DEFAULT 'amount' NOT NULL;--> statement-breakpoint
ALTER TABLE "selling_amount_request" ADD CONSTRAINT "selling_amount_request_kind_check" CHECK ("selling_amount_request"."kind" IN ('amount', 'remove'));