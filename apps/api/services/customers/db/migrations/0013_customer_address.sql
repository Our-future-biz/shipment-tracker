CREATE TABLE "customer_address" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"street" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"postal_code" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	CONSTRAINT "customer_address_type_check" CHECK ("customer_address"."type" IN ('Registered', 'Billing', 'Pickup', 'Delivery', 'Warehouse'))
);
--> statement-breakpoint
ALTER TABLE "customer_address" ADD CONSTRAINT "customer_address_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_address_created_at_idx" ON "customer_address" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "customer_address_deleted_at_idx" ON "customer_address" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "customer_address_company_id_idx" ON "customer_address" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "customer_address_customer_id_idx" ON "customer_address" USING btree ("customer_id");--> statement-breakpoint
-- Every existing customer gets its seat as the Registered address. An ARES address ends ", <city>, <PSČ>", one
-- typed in by hand "<street>, <ZIP> <city>": the parts go to their own fields. Any other form stays whole in the
-- street, to be tidied up by hand.
INSERT INTO "customer_address" ("company_id", "customer_id", "type", "street", "city", "postal_code", "country", "created_at", "updated_at", "deleted_at")
SELECT
  "company_id",
  "id",
  'Registered',
  -- "Vitějovská, 228/12, Praha, 14300" -> "Vitějovská 228/12"
  CASE WHEN "registered_address" ~ ', [^,]+, \d{5}$'
    THEN regexp_replace(regexp_replace("registered_address", ', [^,]+, \d{5}$', ''), '^([^,]+), (\d[^,]*)$', '\1 \2')
    -- "Wittelsbacherplatz 2, 80333 München" -> "Wittelsbacherplatz 2"
    WHEN "data_source" = 'Manual' AND "registered_address" LIKE '%, %' THEN regexp_replace("registered_address", ', [^,]*$', '')
    ELSE "registered_address" END,
  "city",
  -- "14300" -> "143 00", as ARES writes it for a new customer
  CASE WHEN "registered_address" ~ ', [^,]+, \d{5}$'
    THEN regexp_replace(substring("registered_address" from ', (\d{5})$'), '^(\d{3})(\d{2})$', '\1 \2')
    -- "80333 München" -> "80333": the last part without the city
    WHEN "data_source" = 'Manual' AND "registered_address" LIKE '%, %'
    THEN btrim(left(substring("registered_address" from ', ([^,]*)$'), greatest(length(substring("registered_address" from ', ([^,]*)$')) - length("city"), 0)))
    ELSE '' END,
  "country",
  "created_at",
  "created_at",
  "deleted_at"
FROM "customer"
WHERE btrim("registered_address") <> '';
