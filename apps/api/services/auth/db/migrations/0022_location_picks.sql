CREATE TABLE "location_pick" (
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"picks" integer DEFAULT 0 NOT NULL,
	"last_picked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_pick_pkey" PRIMARY KEY("company_id","user_id","code"),
	CONSTRAINT "location_pick_picks_check" CHECK ("location_pick"."picks" >= 0)
);
