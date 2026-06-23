ALTER TABLE "shipment" ALTER COLUMN "cargo_readiness_date" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "cargo_readiness_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "cargo_readiness_date" SET DATA TYPE date USING NULL;--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "pickup_date" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "pickup_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "pickup_date" SET DATA TYPE date USING NULL;--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "closing_date" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "closing_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "closing_date" SET DATA TYPE date USING NULL;--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "eta_warehouse" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "eta_warehouse" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "eta_warehouse" SET DATA TYPE date USING NULL;--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "planned_delivery_date" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "planned_delivery_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ALTER COLUMN "planned_delivery_date" SET DATA TYPE date USING NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "actual_departure" date;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "actual_arrival" date;
