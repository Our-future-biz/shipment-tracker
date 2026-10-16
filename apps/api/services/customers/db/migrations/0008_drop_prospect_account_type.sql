ALTER TABLE "customer" DROP CONSTRAINT "customer_label_check";--> statement-breakpoint
-- "Prospect" is a status, not an account type: customers that had it become TARGET CUSTOMER.
UPDATE "customer" SET "label" = 'TARGET CUSTOMER' WHERE "label" = 'PROSPECT';--> statement-breakpoint
ALTER TABLE "customer" ALTER COLUMN "label" SET DEFAULT 'TARGET CUSTOMER';--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_label_check" CHECK ("customer"."label" IN ('KEY ACCOUNT', 'STANDARD', 'TARGET CUSTOMER', 'RISK'));