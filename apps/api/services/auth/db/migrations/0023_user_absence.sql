-- Users' absences (Council Outlay 11, D12): who is away from one Prague day to another, both included, and who
-- covers meanwhile. Safe to run again: the local databases are shared by every branch.
CREATE TABLE IF NOT EXISTS "user_absence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"cover_user_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "user_absence_dates_check" CHECK ("user_absence"."to_date" >= "user_absence"."from_date")
);
--> statement-breakpoint
ALTER TABLE "user_absence" DROP CONSTRAINT IF EXISTS "user_absence_company_id_company_id_fk";--> statement-breakpoint
ALTER TABLE "user_absence" ADD CONSTRAINT "user_absence_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_absence" DROP CONSTRAINT IF EXISTS "user_absence_user_id_app_user_id_fk";--> statement-breakpoint
ALTER TABLE "user_absence" ADD CONSTRAINT "user_absence_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_absence" DROP CONSTRAINT IF EXISTS "user_absence_cover_user_id_app_user_id_fk";--> statement-breakpoint
ALTER TABLE "user_absence" ADD CONSTRAINT "user_absence_cover_user_id_app_user_id_fk" FOREIGN KEY ("cover_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_absence_company_id_idx" ON "user_absence" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_absence_user_id_idx" ON "user_absence" USING btree ("company_id","user_id","from_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_absence_to_date_idx" ON "user_absence" USING btree ("to_date") WHERE deleted_at IS NULL;
