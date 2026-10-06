-- Ulozene nastaveni rozhrani pro konkretniho uzivatele.
-- Prvni pouziti: vyber poli zobrazenych v kartach na zalozce Details.
CREATE TABLE "user_preference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"pref_key" text NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL
);--> statement-breakpoint
CREATE INDEX "user_preference_created_at_idx" ON "user_preference" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_preference_deleted_at_idx" ON "user_preference" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "user_preference_company_id_idx" ON "user_preference" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_preference_user_key_unique" ON "user_preference" USING btree ("company_id","user_id","pref_key") WHERE deleted_at IS NULL;
