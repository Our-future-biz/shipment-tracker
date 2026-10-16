-- Trucking Council (decision 14): the per-company service identity "Trucking (system)". It never
-- signs in and is not listed; what the system or a haulier causes in another service is written
-- as it. At most one live per company.
ALTER TABLE "app_user" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_system_unique" ON "app_user" USING btree ("company_id") WHERE is_system AND deleted_at IS NULL;