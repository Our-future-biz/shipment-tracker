ALTER TABLE "quote_inquiry" DROP CONSTRAINT "quote_inquiry_kind_check";--> statement-breakpoint
ALTER TABLE "quote_inquiry" ALTER COLUMN "reason" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "quote_inquiry" ALTER COLUMN "snapshot" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_inquiry" ADD COLUMN "details" jsonb;--> statement-breakpoint
ALTER TABLE "quote_inquiry" ADD CONSTRAINT "quote_inquiry_kind_check" CHECK ("quote_inquiry"."kind" IN ('margin', 'warehouse_heavy'));--> statement-breakpoint
-- The warehouse questions already on quotes (data.warehouseInquiry) become rows, once each: a
-- revision carries the answered question of the quote it revises with the same id, so each id is
-- taken from the quote it was asked on - the oldest that carries it. The row keeps the question's
-- id, so an answer or a "seen" sent for it still finds it. Safe to run again (ON CONFLICT).
INSERT INTO "quote_inquiry" (
	"id", "company_id", "quote_id", "quote_number", "kind", "status", "requested_by_id", "requested_at",
	"reason", "note", "details", "decision", "decided_by_id", "decided_at", "comment", "answer_seen_at",
	"created_at", "updated_at"
)
SELECT DISTINCT ON (wi->>'id')
	(wi->>'id')::uuid,
	q.company_id,
	q.id,
	q.quote_number,
	'warehouse_heavy',
	wi->>'status',
	(wi->>'requestedById')::uuid,
	coalesce(nullif(wi->>'requestedAt', '')::timestamptz, q.created_at),
	'',
	coalesce(wi->>'note', ''),
	jsonb_build_object(
		'pieces', CASE WHEN jsonb_typeof(wi->'pieces') = 'number' THEN wi->'pieces' ELSE '0'::jsonb END,
		'grossWeightKg', CASE WHEN jsonb_typeof(wi->'grossWeightKg') = 'number' THEN wi->'grossWeightKg' ELSE '0'::jsonb END,
		'priceEurPerPiece', CASE WHEN jsonb_typeof(wi->'priceEurPerPiece') = 'number' THEN wi->'priceEurPerPiece' ELSE 'null'::jsonb END
	),
	CASE wi->>'status' WHEN 'approved' THEN 'approve' WHEN 'rejected' THEN 'reject' END,
	CASE WHEN wi->>'decidedById' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (wi->>'decidedById')::uuid END,
	nullif(wi->>'decidedAt', '')::timestamptz,
	coalesce(wi->>'comment', ''),
	nullif(wi->>'answerSeenAt', '')::timestamptz,
	coalesce(nullif(wi->>'requestedAt', '')::timestamptz, q.created_at),
	coalesce(nullif(wi->>'decidedAt', '')::timestamptz, nullif(wi->>'requestedAt', '')::timestamptz, q.created_at)
FROM "quote" q
CROSS JOIN LATERAL (SELECT q.data->'warehouseInquiry' AS wi) x
WHERE q.status IS NOT NULL
	AND q.deleted_at IS NULL
	AND jsonb_typeof(wi) = 'object'
	AND wi->>'status' IN ('pending', 'approved', 'rejected')
	AND wi->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
	AND wi->>'requestedById' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ORDER BY wi->>'id', q.created_at, q.id
ON CONFLICT ("id") DO NOTHING;
