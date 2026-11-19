-- Gate release review fixes (19 Nov 2026): a release the Warehouse Concept gate let through on prepayment is
-- recorded on the shipment through the gate's outbox, which delivers at least once - and a manager may send a
-- failed row again. Each such record now carries the outbox row's id (idempotency_key), unique per company, so
-- the same release is recorded once: one override row, one history line, one Tracking note. A person's release
-- in Shipments leaves it empty, and empty keys never clash. Existing rows keep it empty. Safe to run again.
ALTER TABLE "shipment_release_override" ADD COLUMN IF NOT EXISTS "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shipment_release_override_idempotency_key_idx" ON "shipment_release_override" USING btree ("company_id","idempotency_key");
