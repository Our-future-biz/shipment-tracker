-- References that were plain uuids get foreign keys. Rows that point at nothing (dev data only)
-- lose the dangling id first. The internal charge ledger refuses UPDATE through its trigger, so
-- the trigger is off only for this cleanup, inside the migration's transaction.
UPDATE "trucking_consignment" c SET "trip_id" = NULL
  WHERE c."trip_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "trucking_trip" t WHERE t."id" = c."trip_id");--> statement-breakpoint
ALTER TABLE "trucking_internal_charge" DISABLE TRIGGER "trucking_internal_charge_no_update";--> statement-breakpoint
UPDATE "trucking_internal_charge" ic SET "exception_id" = NULL
  WHERE ic."exception_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "trucking_exception" e WHERE e."id" = ic."exception_id");--> statement-breakpoint
UPDATE "trucking_internal_charge" ic SET "tariff_version_id" = NULL
  WHERE ic."tariff_version_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "trucking_tariff_version" v WHERE v."id" = ic."tariff_version_id");--> statement-breakpoint
ALTER TABLE "trucking_internal_charge" ENABLE TRIGGER "trucking_internal_charge_no_update";--> statement-breakpoint
ALTER TABLE "trucking_internal_charge" ADD CONSTRAINT "trucking_internal_charge_exception_fk" FOREIGN KEY ("exception_id") REFERENCES "public"."trucking_exception"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucking_internal_charge" ADD CONSTRAINT "trucking_internal_charge_tariff_version_fk" FOREIGN KEY ("tariff_version_id") REFERENCES "public"."trucking_tariff_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucking_consignment" ADD CONSTRAINT "trucking_consignment_trip_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trucking_trip"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- A haulier invoice's gross is its net plus VAT; a row entered before the rule takes the computed gross.
UPDATE "trucking_haulier_invoice" SET "total_gross" = "total_net" + "vat_amount" WHERE "total_gross" <> "total_net" + "vat_amount";--> statement-breakpoint
ALTER TABLE "trucking_haulier_invoice" ADD CONSTRAINT "trucking_haulier_invoice_gross_check" CHECK ("trucking_haulier_invoice"."total_gross" = "trucking_haulier_invoice"."total_net" + "trucking_haulier_invoice"."vat_amount");
