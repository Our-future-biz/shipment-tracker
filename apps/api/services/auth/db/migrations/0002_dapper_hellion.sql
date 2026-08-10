-- Tenancy rollout: every user must belong to a company. Existing users predate the
-- company_id column and have no company to backfill to, so on disposable dev/staging
-- data we clear app_user first (column_template cascades) and reseed via scripts/seed.ts.
DELETE FROM "app_user";--> statement-breakpoint
CREATE TABLE "company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"slug" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_user" DROP CONSTRAINT "app_user_email_unique";--> statement-breakpoint
DROP INDEX "app_user_email_idx";--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
CREATE INDEX "company_created_at_idx" ON "company" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "company_deleted_at_idx" ON "company" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "company_slug_unique" ON "company" USING btree ("slug") WHERE deleted_at IS NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_user_company_id_idx" ON "app_user" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_email_unique" ON "app_user" USING btree (lower("email")) WHERE deleted_at IS NULL;
