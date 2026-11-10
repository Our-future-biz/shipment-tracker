ALTER TABLE "shipment_note" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
-- To-dos starred before this keep their order: their last change stands for when they were starred.
UPDATE "shipment_note" SET "pinned_at" = "updated_at" WHERE "pinned";