-- When a buying cost's vendor invoice was received (stamped when Received is ticked) and the day it was paid
-- (Council Outlay 7, step 6b). Lines already ticked Received keep no date: their due day is unknown. Safe to run again.
ALTER TABLE "invoice_cost" ADD COLUMN IF NOT EXISTS "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoice_cost" ADD COLUMN IF NOT EXISTS "paid_on" date;
