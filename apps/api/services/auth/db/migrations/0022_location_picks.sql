-- How often each user picked a place, airport or terminal code in a location picker: the pickers list a
-- user's most picked first. Safe to run again: the local databases are shared by every branch.
CREATE TABLE IF NOT EXISTS "location_pick" (
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"picks" integer DEFAULT 0 NOT NULL,
	"last_picked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_pick_pkey" PRIMARY KEY("company_id","user_id","code"),
	CONSTRAINT "location_pick_picks_check" CHECK ("location_pick"."picks" >= 0)
);
--> statement-breakpoint
ALTER TABLE "location_pick" DROP CONSTRAINT IF EXISTS "location_pick_company_id_company_id_fk";--> statement-breakpoint
ALTER TABLE "location_pick" ADD CONSTRAINT "location_pick_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_pick" DROP CONSTRAINT IF EXISTS "location_pick_user_id_app_user_id_fk";--> statement-breakpoint
ALTER TABLE "location_pick" ADD CONSTRAINT "location_pick_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
