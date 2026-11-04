-- The customer list's Last contact reads each company's newest live Communication entry (Council Review 5
-- follow-up): one index read per company. Safe to run again.
CREATE INDEX IF NOT EXISTS "customer_note_last_contact_idx" ON "customer_note" USING btree ("customer_id","created_at") WHERE "customer_note"."deleted_at" IS NULL;
