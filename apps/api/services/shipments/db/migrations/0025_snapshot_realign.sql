-- Realigns the drizzle snapshot chain.
--
-- Migrations 0020-0024 were hand-written, so no meta/00XX_snapshot.json was
-- produced for them and `drizzle-kit generate` kept diffing against 0019 --
-- meaning the next generated migration would have re-emitted all of their DDL.
-- This migration IS that re-emitted DDL, rewritten to be idempotent, and it
-- ships the 0025 snapshot that future generates now diff against.
--
-- On a database where 0020-0024 already ran this is a no-op.
-- On a fresh database it is redundant with them but harmless.

CREATE TABLE IF NOT EXISTS "user_preference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"pref_key" text NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "vgm_closing" date;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "si_closing" date;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "mrn" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "cs_recv_invoice" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "cs_recv_packing" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "release_reference" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "release_depot" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "redelivery_reference" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN IF NOT EXISTS "redelivery_depot" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_attachment" ADD COLUMN IF NOT EXISTS "document_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_attachment" ADD COLUMN IF NOT EXISTS "customs_status" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_attachment" ADD COLUMN IF NOT EXISTS "customs_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment_attachment" ADD COLUMN IF NOT EXISTS "customs_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipment_attachment" ADD COLUMN IF NOT EXISTS "customs_reviewed_by_id" uuid;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_preference_created_at_idx" ON "user_preference" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_preference_deleted_at_idx" ON "user_preference" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_preference_company_id_idx" ON "user_preference" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_preference_user_key_unique" ON "user_preference" USING btree ("company_id","user_id","pref_key") WHERE deleted_at IS NULL;
