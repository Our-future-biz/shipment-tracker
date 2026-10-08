CREATE TABLE "announcement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"department_id" uuid,
	"branch_id" uuid,
	"country" text,
	"severity" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"author_id" uuid NOT NULL,
	CONSTRAINT "announcement_scope_check" CHECK ("announcement"."scope" IN ('company', 'department', 'branch', 'country')),
	CONSTRAINT "announcement_severity_check" CHECK ("announcement"."severity" IN ('info', 'warning', 'critical'))
);
--> statement-breakpoint
CREATE TABLE "branch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "department" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_author_id_app_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch" ADD CONSTRAINT "branch_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department" ADD CONSTRAINT "department_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcement_created_at_idx" ON "announcement" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "announcement_deleted_at_idx" ON "announcement" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "announcement_company_id_idx" ON "announcement" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "announcement_company_scope_idx" ON "announcement" USING btree ("company_id","scope");--> statement-breakpoint
CREATE INDEX "branch_created_at_idx" ON "branch" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "branch_deleted_at_idx" ON "branch" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "branch_company_id_idx" ON "branch" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "branch_company_name_unique" ON "branch" USING btree ("company_id",lower("name")) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "department_created_at_idx" ON "department" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "department_deleted_at_idx" ON "department" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "department_company_id_idx" ON "department" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "department_company_name_unique" ON "department" USING btree ("company_id",lower("name")) WHERE deleted_at IS NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;