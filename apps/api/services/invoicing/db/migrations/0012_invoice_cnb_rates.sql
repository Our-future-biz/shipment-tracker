ALTER TABLE "invoice_line" ADD COLUMN "fx_rate" numeric(14, 6);--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "fx_fixing_date" date;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "fx_source" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "roe_pct" numeric(6, 3);