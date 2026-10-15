-- Trucking writes the delivery date of a road job when its delivery is stamped (Phase 4).
ALTER TABLE "shipment" ADD COLUMN "actual_delivery_date" date;
