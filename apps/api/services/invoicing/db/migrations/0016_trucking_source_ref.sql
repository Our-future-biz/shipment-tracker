-- Trucking pushes its lines into Costs Breakdown (Phase 4): sell rows tagged trucking:consignment:<id>,
-- buy rows trucking:trip:<id>. A push replaces the live rows of its tag in one transaction; selling
-- rows already on an issued invoice are never touched.
ALTER TABLE "invoice_cost" ADD COLUMN "source_trucking_ref" text;--> statement-breakpoint
ALTER TABLE "invoice_selling_cost" ADD COLUMN "source_trucking_ref" text;--> statement-breakpoint
CREATE INDEX "invoice_cost_trucking_ref_idx" ON "invoice_cost" USING btree ("company_id","source_trucking_ref") WHERE source_trucking_ref IS NOT NULL;--> statement-breakpoint
CREATE INDEX "invoice_selling_cost_trucking_ref_idx" ON "invoice_selling_cost" USING btree ("company_id","source_trucking_ref") WHERE source_trucking_ref IS NOT NULL;
