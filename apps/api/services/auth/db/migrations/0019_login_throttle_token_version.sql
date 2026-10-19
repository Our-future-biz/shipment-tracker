CREATE TABLE "login_throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"lock_level" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_throttle_failures_check" CHECK ("login_throttle"."failures" >= 0)
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "login_throttle_updated_idx" ON "login_throttle" USING btree ("updated_at");