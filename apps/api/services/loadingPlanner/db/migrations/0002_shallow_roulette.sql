ALTER TABLE "planner_setting" ADD COLUMN "oog_width_mm" integer DEFAULT 3500 NOT NULL;--> statement-breakpoint
ALTER TABLE "planner_setting" ADD COLUMN "oog_over_end_mm" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "planner_setting" ADD COLUMN "oog_height_mm" integer DEFAULT 3200 NOT NULL;--> statement-breakpoint
ALTER TABLE "planner_setting" ADD COLUMN "heavy_warn_kg" integer DEFAULT 5000 NOT NULL;--> statement-breakpoint
ALTER TABLE "planner_setting" ADD COLUMN "heavy_move_kg" integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "planner_setting" ADD CONSTRAINT "planner_setting_heavy_check" CHECK ("planner_setting"."heavy_warn_kg" > 0 AND "planner_setting"."heavy_move_kg" >= "planner_setting"."heavy_warn_kg");--> statement-breakpoint
ALTER TABLE "planner_setting" ADD CONSTRAINT "planner_setting_oog_check" CHECK ("planner_setting"."oog_width_mm" > 0 AND "planner_setting"."oog_over_end_mm" >= 0 AND "planner_setting"."oog_height_mm" > 0);