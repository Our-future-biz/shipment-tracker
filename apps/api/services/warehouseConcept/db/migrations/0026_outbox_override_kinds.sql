-- Mock test council n27: the gate's override record on the shipment and an approval given back go through the
-- shipment outbox (retried) as two more kinds. Dropped and added again, so it is safe to run twice; every row
-- there holds one of the three old kinds, which the new check takes.
ALTER TABLE "warehouse_shipment_outbox" DROP CONSTRAINT IF EXISTS "wh_outbox_kind_check";--> statement-breakpoint
ALTER TABLE "warehouse_shipment_outbox" ADD CONSTRAINT "wh_outbox_kind_check" CHECK ("warehouse_shipment_outbox"."kind" IN ('received', 'released', 'plate', 'override', 'passBack'));
