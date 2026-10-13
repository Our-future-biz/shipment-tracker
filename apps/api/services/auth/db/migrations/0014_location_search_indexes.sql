CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "location_code_idx" ON "location" USING btree ("code");--> statement-breakpoint
CREATE INDEX "location_code_trgm_idx" ON "location" USING gin ("code" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "location_name_ascii_trgm_idx" ON "location" USING gin ("name_ascii" gin_trgm_ops);