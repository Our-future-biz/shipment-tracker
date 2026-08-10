-- Tenancy rollout: terms/prefs rows predate company_id. On disposable dev/staging data
-- we clear them so the NOT NULL company_id columns can be added. Default T&C templates
-- are re-seeded per company on first use; prefs are UI state that regenerates.
DELETE FROM "sales_preference";--> statement-breakpoint
DELETE FROM "terms_condition";--> statement-breakpoint
ALTER TABLE "sales_preference" DROP CONSTRAINT "sales_preference_pref_key_unique";--> statement-breakpoint
ALTER TABLE "terms_condition" DROP CONSTRAINT "terms_condition_name_unique";--> statement-breakpoint
DROP INDEX "sales_preference_pref_key_idx";--> statement-breakpoint
DROP INDEX "terms_condition_name_idx";--> statement-breakpoint
ALTER TABLE "sales_preference" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "terms_condition" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
CREATE INDEX "sales_preference_company_id_idx" ON "sales_preference" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_preference_company_key_unique" ON "sales_preference" USING btree ("company_id","pref_key") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "terms_condition_company_id_idx" ON "terms_condition" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "terms_condition_company_name_unique" ON "terms_condition" USING btree ("company_id",lower("name")) WHERE deleted_at IS NULL;