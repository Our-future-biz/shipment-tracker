ALTER TABLE "column_template" DROP CONSTRAINT "column_template_user_name_uq";--> statement-breakpoint
ALTER TABLE "column_template" ADD COLUMN "scope" text DEFAULT 'shipments' NOT NULL;--> statement-breakpoint
ALTER TABLE "column_template" ADD CONSTRAINT "column_template_user_scope_name_uq" UNIQUE("user_id","scope","name");