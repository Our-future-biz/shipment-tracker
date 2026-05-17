CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "app_user_created_at_idx" ON "app_user" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "app_user_deleted_at_idx" ON "app_user" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "app_user_email_idx" ON "app_user" USING btree ("email");