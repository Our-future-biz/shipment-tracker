CREATE TABLE "shipment_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"text" text NOT NULL,
	"author_id" uuid,
	"done_at" timestamp with time zone,
	"done_by_id" uuid
);
--> statement-breakpoint
ALTER TABLE "shipment_note" ADD CONSTRAINT "shipment_note_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_note_company_id_idx" ON "shipment_note" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "shipment_note_shipment_id_idx" ON "shipment_note" USING btree ("shipment_id");