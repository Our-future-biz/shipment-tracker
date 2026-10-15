-- Phase 2b: a tariff version imported from an Excel file keeps the file (bucket trucking-tariff-files,
-- source_key) with its name and sha256, and the problems met reading it (parse_findings).
ALTER TABLE "trucking_tariff_version" ADD COLUMN "parse_findings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trucking_tariff_version" ADD COLUMN "source_file_name" text;--> statement-breakpoint
ALTER TABLE "trucking_tariff_version" ADD COLUMN "source_sha256" text;--> statement-breakpoint
ALTER TABLE "trucking_tariff_version" ADD COLUMN "source_key" text;
