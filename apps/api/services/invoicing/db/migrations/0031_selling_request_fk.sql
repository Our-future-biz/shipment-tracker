-- A request about a selling row nobody has any more has nothing left to answer: removed, so the key holds.
DELETE FROM "selling_amount_request" r WHERE NOT EXISTS (SELECT 1 FROM "invoice_selling_cost" s WHERE s."id" = r."selling_cost_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "selling_amount_request" ADD CONSTRAINT "selling_amount_request_selling_cost_id_invoice_selling_cost_id_fk" FOREIGN KEY ("selling_cost_id") REFERENCES "public"."invoice_selling_cost"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
