-- Chat message a file was sent with (null = added on the Documents tab).
-- IF NOT EXISTS so a database where the column was added by hand still migrates.
ALTER TABLE "shipment_attachment" ADD COLUMN IF NOT EXISTS "comment_id" uuid;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipment_attachment_comment_id_idx" ON "shipment_attachment" USING btree ("comment_id");
