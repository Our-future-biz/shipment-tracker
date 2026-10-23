CREATE TABLE IF NOT EXISTS "quote_comment_read" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"thread_ref" text NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_comment_read_user_thread_uq" UNIQUE("company_id","user_id","thread_ref")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quote_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"thread_ref" text NOT NULL,
	"quote_number" text NOT NULL,
	"author_id" uuid NOT NULL,
	"message" text NOT NULL,
	"mentioned_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quote_attachment" ADD COLUMN IF NOT EXISTS "comment_id" uuid;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quote_comment_read_company_id_idx" ON "quote_comment_read" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quote_comment_read_user_idx" ON "quote_comment_read" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quote_comment_company_id_idx" ON "quote_comment" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quote_comment_company_thread_idx" ON "quote_comment" USING btree ("company_id","thread_ref","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quote_comment_mentioned_user_ids_idx" ON "quote_comment" USING gin ("mentioned_user_ids");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quote_attachment" ADD CONSTRAINT "quote_attachment_comment_id_quote_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."quote_comment"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quote_attachment_comment_id_idx" ON "quote_attachment" USING btree ("comment_id");