-- Templates belong to the company of the user who saved them.
ALTER TABLE "column_template" ADD COLUMN "company_id" uuid;--> statement-breakpoint
UPDATE "column_template" t SET "company_id" = u."company_id" FROM "app_user" u WHERE u."id" = t."user_id";--> statement-breakpoint
DELETE FROM "column_template" WHERE "company_id" IS NULL;--> statement-breakpoint
ALTER TABLE "column_template" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "column_template" ADD CONSTRAINT "column_template_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcement_author_id_idx" ON "announcement" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "announcement_department_id_idx" ON "announcement" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "announcement_branch_id_idx" ON "announcement" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "column_template_company_id_idx" ON "column_template" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "branch_location_id_idx" ON "branch" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "app_user_department_id_idx" ON "app_user" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "app_user_branch_id_idx" ON "app_user" USING btree ("branch_id");