ALTER TABLE "quote_inquiry" ADD COLUMN "requested_by_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_inquiry" ADD COLUMN "decided_by_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "quote_inquiry_company_quote_idx" ON "quote_inquiry" USING btree ("company_id","quote_id");--> statement-breakpoint
CREATE INDEX "quote_inquiry_company_kind_requested_idx" ON "quote_inquiry" USING btree ("company_id","kind","requested_at");--> statement-breakpoint
-- A warehouse question keeps the names its quote recorded with it (any quote carrying the same question).
UPDATE "quote_inquiry" qi
SET "requested_by_name" = coalesce(q.data->'warehouseInquiry'->>'requestedByName', ''),
	"decided_by_name" = coalesce(q.data->'warehouseInquiry'->>'decidedByName', '')
FROM "quote" q
WHERE qi."kind" = 'warehouse_heavy'
	AND qi."requested_by_name" = ''
	AND q.company_id = qi.company_id
	AND jsonb_typeof(q.data->'warehouseInquiry') = 'object'
	AND q.data->'warehouseInquiry'->>'id' = qi."id"::text;--> statement-breakpoint
-- A question still waiting on a quote that was deleted can never be answered: it is withdrawn, as a delete now does.
UPDATE "quote_inquiry" qi
SET "status" = 'withdrawn', "comment" = 'The quote was deleted', "updated_at" = now()
FROM "quote" q
WHERE qi."status" = 'pending'
	AND qi."deleted_at" IS NULL
	AND q.id = qi."quote_id"
	AND q.company_id = qi."company_id"
	AND q.deleted_at IS NOT NULL;
