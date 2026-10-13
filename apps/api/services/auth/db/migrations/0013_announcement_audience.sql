ALTER TABLE "announcement" DROP CONSTRAINT "announcement_scope_check";--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_scope_check" CHECK ("announcement"."scope" IN ('company', 'audience', 'department', 'branch', 'country'));