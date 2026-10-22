-- When each user last opened a shipment's Alerts: what came later is counted as new on the tab.
CREATE TABLE "shipment_alert_read" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_alert_read_user_shipment_uq" UNIQUE("user_id","shipment_id")
);
--> statement-breakpoint
ALTER TABLE "shipment_alert_read" ADD CONSTRAINT "shipment_alert_read_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_alert_read_company_id_idx" ON "shipment_alert_read" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "shipment_alert_read_user_idx" ON "shipment_alert_read" USING btree ("user_id");