-- The gate's own Warehouse Released days of a shipment are read over every outbox row of it, sent ones too
-- (repository sentReleasedDays, mock test council round 4); the shipment index there covers pending rows only.
CREATE INDEX IF NOT EXISTS "warehouse_shipment_outbox_shipment_all_idx" ON "warehouse_shipment_outbox" USING btree ("company_id","shipment_id");
