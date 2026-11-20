-- User Council E5 (20 Nov 2026): the delivery telephone and the delivery time window / unloading notes a
-- customer gives on the Import Instructions reached only the filed PDF, and the dispatcher retyped them. The
-- job now keeps them beside the Delivery Address (the person stays the consignee's Contact): an approved
-- form fills them while empty, and a Trucking order made from the job starts from them. Existing jobs get
-- them empty. Safe to run again.
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "delivery_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "delivery_notes" text DEFAULT '' NOT NULL;
