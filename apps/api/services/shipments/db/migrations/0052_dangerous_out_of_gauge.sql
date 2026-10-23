-- Dangerous and Out Of Gauge (Yes / No) for the shipments grid; empty until picked.
ALTER TABLE "shipment" ADD COLUMN "dangerous" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "out_of_gauge" text DEFAULT '' NOT NULL;