CREATE TABLE "customer_list_pref" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"pref_key" text NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "customer_list_pref_created_at_idx" ON "customer_list_pref" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "customer_list_pref_deleted_at_idx" ON "customer_list_pref" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "customer_list_pref_company_id_idx" ON "customer_list_pref" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_list_pref_user_key_unique" ON "customer_list_pref" USING btree ("company_id","user_id","pref_key") WHERE deleted_at IS NULL;