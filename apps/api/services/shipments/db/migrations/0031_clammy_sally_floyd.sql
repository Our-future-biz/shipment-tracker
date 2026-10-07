-- Colleagues tagged with @ in a chat message.
-- IF NOT EXISTS so a database where the column was added by hand still migrates.
ALTER TABLE "shipment_comment" ADD COLUMN IF NOT EXISTS "mentioned_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;
