CREATE TABLE "column_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"columns" jsonb NOT NULL,
	CONSTRAINT "column_template_user_name_uq" UNIQUE("user_id","name")
);
--> statement-breakpoint
ALTER TABLE "column_template" ADD CONSTRAINT "column_template_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "column_template_created_at_idx" ON "column_template" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "column_template_deleted_at_idx" ON "column_template" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "column_template_user_id_idx" ON "column_template" USING btree ("user_id");