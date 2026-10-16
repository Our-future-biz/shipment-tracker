ALTER TABLE "customer" ADD COLUMN "industry" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "typical_cargo" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "stability" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "risk_level" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_risk_level_check" CHECK ("customer"."risk_level" IN ('', 'Low', 'Medium', 'High'));