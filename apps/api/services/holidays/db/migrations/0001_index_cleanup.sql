DROP INDEX "public_holiday_created_at_idx";--> statement-breakpoint
DROP INDEX "public_holiday_deleted_at_idx";--> statement-breakpoint
DROP INDEX "public_holiday_company_id_idx";--> statement-breakpoint
CREATE INDEX "public_holiday_company_id_idx" ON "public_holiday" USING btree ("company_id","created_at");