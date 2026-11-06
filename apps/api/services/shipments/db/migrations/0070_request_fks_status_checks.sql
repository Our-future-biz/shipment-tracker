-- Requests whose shipment or document is gone have nothing left to answer: removed, so the keys hold.
DELETE FROM "customs_office_request" r WHERE NOT EXISTS (SELECT 1 FROM "shipment" s WHERE s."id" = r."shipment_id");--> statement-breakpoint
DELETE FROM "document_change_request" r WHERE NOT EXISTS (SELECT 1 FROM "shipment" s WHERE s."id" = r."shipment_id") OR NOT EXISTS (SELECT 1 FROM "shipment_attachment" a WHERE a."id" = r."attachment_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customs_office_request" ADD CONSTRAINT "customs_office_request_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "document_change_request" ADD CONSTRAINT "document_change_request_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "document_change_request" ADD CONSTRAINT "document_change_request_attachment_id_shipment_attachment_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."shipment_attachment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customs_office_request" ADD CONSTRAINT "customs_office_request_status_check" CHECK ("customs_office_request"."status" IN ('pending', 'approved', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "document_change_request" ADD CONSTRAINT "document_change_request_status_check" CHECK ("document_change_request"."status" IN ('pending', 'approved', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
