CREATE TABLE "shipment_comment_read" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_comment_read_user_shipment_uq" UNIQUE("user_id","shipment_id")
);
--> statement-breakpoint
CREATE INDEX "shipment_comment_read_created_at_idx" ON "shipment_comment_read" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "shipment_comment_read_deleted_at_idx" ON "shipment_comment_read" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "shipment_comment_read_company_id_idx" ON "shipment_comment_read" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "shipment_comment_read_user_idx" ON "shipment_comment_read" USING btree ("user_id");