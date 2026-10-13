CREATE TABLE "location" (
	"id" integer PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"country_code" text NOT NULL,
	"name" text NOT NULL,
	"name_ascii" text NOT NULL,
	"subdivision_name" text
);
--> statement-breakpoint
ALTER TABLE "branch" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "branch" ADD COLUMN "location_id" integer;--> statement-breakpoint
ALTER TABLE "branch" ADD COLUMN "city" text;--> statement-breakpoint
CREATE INDEX "location_country_code_idx" ON "location" USING btree ("country_code");--> statement-breakpoint
ALTER TABLE "branch" ADD CONSTRAINT "branch_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE no action ON UPDATE no action;