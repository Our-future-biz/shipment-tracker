-- The supplier a buying cost's vendor names, when it was picked from the Customer Database or came so from the
-- quote (Council Outlay 7, step 6): a company id, no FK (another service's database). Null for a vendor only typed.
ALTER TABLE "invoice_cost" ADD COLUMN IF NOT EXISTS "supplier_customer_id" uuid;
