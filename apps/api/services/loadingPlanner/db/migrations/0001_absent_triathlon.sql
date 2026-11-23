CREATE TABLE "planner_setting" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"door_width_mm" integer NOT NULL,
	"door_height_mm" integer NOT NULL,
	"length_mm" integer NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planner_setting_clearance_check" CHECK ("planner_setting"."door_width_mm" BETWEEN 0 AND 500 AND "planner_setting"."door_height_mm" BETWEEN 0 AND 500 AND "planner_setting"."length_mm" BETWEEN 0 AND 500)
);
