CREATE TABLE "country" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "country" ADD CONSTRAINT "country_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "country_created_at_idx" ON "country" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "country_deleted_at_idx" ON "country" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "country_company_id_idx" ON "country" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "country_company_code_unique" ON "country" USING btree ("company_id","code") WHERE deleted_at IS NULL;