-- A warehouse question and its answer now also go to the quote's chat (salesQuote.service,
-- postInquiryToChat). The quotes that already asked get the same messages once, with the time
-- and the author they had: the question from the one who asked, the answer from the manager.
-- The wording is the quote history's.
WITH inquiry AS (
  SELECT
    q.company_id,
    q.quote_number,
    regexp_replace(q.quote_number, '-R[0-9]+$', '') AS thread_ref,
    q.data -> 'warehouseInquiry' AS i
  FROM "quote" q
  WHERE q.deleted_at IS NULL
    AND jsonb_typeof(q.data -> 'warehouseInquiry') = 'object'
    AND q.data -> 'warehouseInquiry' ->> 'status' IN ('pending', 'approved', 'rejected')
),
what AS (
  SELECT
    *,
    (i ->> 'pieces') || ' piece' || CASE WHEN (i ->> 'pieces') = '1' THEN '' ELSE 's' END || ' of 12.5 t or more' AS pieces_text
  FROM inquiry
)
INSERT INTO "quote_comment" ("company_id", "thread_ref", "quote_number", "author_id", "message", "created_at", "updated_at")
SELECT company_id, thread_ref, quote_number, (i ->> 'requestedById')::uuid,
  'Warehouse asked about ' || pieces_text || CASE WHEN coalesce(i ->> 'note', '') <> '' THEN ' - ' || (i ->> 'note') ELSE '' END,
  (i ->> 'requestedAt')::timestamptz, (i ->> 'requestedAt')::timestamptz
FROM what
WHERE (i ->> 'requestedById') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND coalesce(i ->> 'requestedAt', '') <> ''
UNION ALL
SELECT company_id, thread_ref, quote_number, (i ->> 'decidedById')::uuid,
  CASE WHEN i ->> 'status' = 'approved'
    THEN 'Warehouse approved ' || pieces_text || ': EUR ' || coalesce(i ->> 'priceEurPerPiece', '0') || ' per piece'
      || CASE WHEN coalesce(i ->> 'comment', '') <> '' THEN ' - ' || (i ->> 'comment') ELSE '' END
    ELSE 'Warehouse rejected ' || pieces_text || ': ' || coalesce(i ->> 'comment', '')
  END,
  (i ->> 'decidedAt')::timestamptz, (i ->> 'decidedAt')::timestamptz
FROM what
WHERE i ->> 'status' IN ('approved', 'rejected')
  AND (i ->> 'decidedById') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND coalesce(i ->> 'decidedAt', '') <> '';
