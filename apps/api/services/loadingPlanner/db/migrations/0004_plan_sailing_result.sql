ALTER TABLE "loading_plan" DROP CONSTRAINT "loading_plan_link_kind_check";--> statement-breakpoint
ALTER TABLE "loading_plan" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "loading_plan" ADD CONSTRAINT "loading_plan_link_kind_check" CHECK ("loading_plan"."link_kind" IN ('shipment', 'quote', 'sailing'));