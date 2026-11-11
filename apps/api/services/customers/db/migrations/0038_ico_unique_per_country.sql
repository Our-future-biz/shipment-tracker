-- A registration number is unique per company and country (a German "HRB 12345" is no Austrian
-- company's). The country is read as lib/registerNumber reads it: an upper-case code, a blank one
-- CZ (the column's default; every customer from before foreign ones could be added came from ARES).
-- Stored so first, the deleted customers too (a restore is checked against the same index). This
-- can't make two live customers clash: (company, IČO) was unique among them already.
UPDATE "customer"
SET "country" = CASE WHEN btrim("country") = '' THEN 'CZ' ELSE upper(btrim("country")) END
WHERE "country" <> CASE WHEN btrim("country") = '' THEN 'CZ' ELSE upper(btrim("country")) END;--> statement-breakpoint
DROP INDEX "customer_company_ico_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "customer_company_country_ico_unique" ON "customer" USING btree ("company_id","country","ico") WHERE deleted_at IS NULL AND ico <> '';
