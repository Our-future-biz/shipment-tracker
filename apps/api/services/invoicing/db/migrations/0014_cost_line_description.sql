ALTER TABLE "invoice_cost" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_cost" ADD COLUMN "source_quote_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_selling_cost" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_selling_cost" ADD COLUMN "source_quote_number" text DEFAULT '' NOT NULL;