DROP INDEX "announcement_attachment_created_at_idx";--> statement-breakpoint
DROP INDEX "announcement_attachment_deleted_at_idx";--> statement-breakpoint
DROP INDEX "announcement_created_at_idx";--> statement-breakpoint
DROP INDEX "announcement_deleted_at_idx";--> statement-breakpoint
DROP INDEX "column_template_created_at_idx";--> statement-breakpoint
DROP INDEX "column_template_deleted_at_idx";--> statement-breakpoint
DROP INDEX "company_deleted_at_idx";--> statement-breakpoint
DROP INDEX "branch_created_at_idx";--> statement-breakpoint
DROP INDEX "branch_deleted_at_idx";--> statement-breakpoint
DROP INDEX "country_created_at_idx";--> statement-breakpoint
DROP INDEX "country_deleted_at_idx";--> statement-breakpoint
DROP INDEX "department_created_at_idx";--> statement-breakpoint
DROP INDEX "department_deleted_at_idx";--> statement-breakpoint
DROP INDEX "app_user_created_at_idx";--> statement-breakpoint
DROP INDEX "app_user_deleted_at_idx";--> statement-breakpoint
DROP INDEX "announcement_attachment_company_id_idx";--> statement-breakpoint
DROP INDEX "announcement_company_id_idx";--> statement-breakpoint
DROP INDEX "column_template_company_id_idx";--> statement-breakpoint
DROP INDEX "branch_company_id_idx";--> statement-breakpoint
DROP INDEX "country_company_id_idx";--> statement-breakpoint
DROP INDEX "department_company_id_idx";--> statement-breakpoint
DROP INDEX "app_user_company_id_idx";--> statement-breakpoint
CREATE INDEX "announcement_attachment_company_id_idx" ON "announcement_attachment" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "announcement_company_id_idx" ON "announcement" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "column_template_company_id_idx" ON "column_template" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "branch_company_id_idx" ON "branch" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "country_company_id_idx" ON "country" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "department_company_id_idx" ON "department" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "app_user_company_id_idx" ON "app_user" USING btree ("company_id","created_at");