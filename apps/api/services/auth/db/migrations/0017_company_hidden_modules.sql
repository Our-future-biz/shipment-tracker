ALTER TABLE "company" ADD COLUMN "hidden_modules" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_hidden_modules_check" CHECK ("company"."hidden_modules" <@ ARRAY['warehouse_concept', 'trucking_concept']::text[]);--> statement-breakpoint
-- Austromar does not get the Warehouse Concept and the Trucking Concept for now (its superadmins
-- still see them). Idempotent: a company that hides them already is left as it is.
UPDATE "company" SET "hidden_modules" = ARRAY['warehouse_concept', 'trucking_concept']::text[], "updated_at" = now()
  WHERE "slug" = 'austromar' AND "deleted_at" IS NULL
    AND NOT ("hidden_modules" @> ARRAY['warehouse_concept', 'trucking_concept']::text[]);
