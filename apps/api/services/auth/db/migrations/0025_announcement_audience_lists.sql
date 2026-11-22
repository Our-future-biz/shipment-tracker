-- Noticeboard posts for several countries, branches and departments at once (owner's answer 22 Nov): an
-- "audience" post keeps each as a list, empty for all. The audience posts from before get their one country,
-- branch and department as a list of one. Safe to run again: the local databases are shared by every branch.
ALTER TABLE "announcement" ADD COLUMN IF NOT EXISTS "country_codes" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN IF NOT EXISTS "branch_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN IF NOT EXISTS "department_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
UPDATE "announcement"
SET
  "country_codes" = CASE WHEN "country_code" IS NULL THEN '{}'::text[] ELSE ARRAY["country_code"] END,
  "branch_ids" = CASE WHEN "branch_id" IS NULL THEN '{}'::uuid[] ELSE ARRAY["branch_id"] END,
  "department_ids" = CASE WHEN "department_id" IS NULL THEN '{}'::uuid[] ELSE ARRAY["department_id"] END
WHERE "scope" = 'audience'
  AND cardinality("country_codes") = 0
  AND cardinality("branch_ids") = 0
  AND cardinality("department_ids") = 0;
