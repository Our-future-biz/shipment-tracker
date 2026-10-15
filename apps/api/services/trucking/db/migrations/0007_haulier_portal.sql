CREATE TABLE "trucking_portal_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	CONSTRAINT "trucking_portal_session_hash_check" CHECK ("trucking_portal_session"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "trucking_portal_session_expiry_check" CHECK ("trucking_portal_session"."expires_at" <= "trucking_portal_session"."absolute_expires_at")
);
--> statement-breakpoint
CREATE TABLE "trucking_portal_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trucking_portal_token_kind_check" CHECK ("trucking_portal_token"."kind" IN ('INVITE', 'RESET')),
	CONSTRAINT "trucking_portal_token_hash_check" CHECK ("trucking_portal_token"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "trucking_portal_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"haulier_customer_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"password_hash" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "trucking_portal_user_status_check" CHECK ("trucking_portal_user"."status" IN ('ACTIVE', 'DISABLED')),
	CONSTRAINT "trucking_portal_user_email_check" CHECK ("trucking_portal_user"."email" = lower("trucking_portal_user"."email") AND length("trucking_portal_user"."email") BETWEEN 3 AND 254),
	CONSTRAINT "trucking_portal_user_failed_check" CHECK ("trucking_portal_user"."failed_attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "trucking_portal_session" ADD CONSTRAINT "trucking_portal_session_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."trucking_portal_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucking_portal_token" ADD CONSTRAINT "trucking_portal_token_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."trucking_portal_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trucking_portal_session_company_id_idx" ON "trucking_portal_session" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_portal_session_token_unique" ON "trucking_portal_session" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "trucking_portal_session_user_idx" ON "trucking_portal_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trucking_portal_token_company_id_idx" ON "trucking_portal_token" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_portal_token_hash_unique" ON "trucking_portal_token" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "trucking_portal_token_user_idx" ON "trucking_portal_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trucking_portal_user_created_at_idx" ON "trucking_portal_user" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trucking_portal_user_deleted_at_idx" ON "trucking_portal_user" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "trucking_portal_user_company_id_idx" ON "trucking_portal_user" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trucking_portal_user_email_unique" ON "trucking_portal_user" USING btree ("company_id","email") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "trucking_portal_user_email_idx" ON "trucking_portal_user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "trucking_portal_user_haulier_idx" ON "trucking_portal_user" USING btree ("company_id","haulier_customer_id");