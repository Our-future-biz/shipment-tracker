CREATE TABLE "announcement_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"announcement_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text DEFAULT '' NOT NULL,
	"file_size" bigint DEFAULT 0 NOT NULL,
	"file_data" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcement_attachment" ADD CONSTRAINT "announcement_attachment_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_attachment" ADD CONSTRAINT "announcement_attachment_announcement_id_announcement_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcement_attachment_created_at_idx" ON "announcement_attachment" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "announcement_attachment_deleted_at_idx" ON "announcement_attachment" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "announcement_attachment_company_id_idx" ON "announcement_attachment" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "announcement_attachment_announcement_id_idx" ON "announcement_attachment" USING btree ("announcement_id");