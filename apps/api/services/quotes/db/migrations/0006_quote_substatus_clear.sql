-- The Feedback sub-status ("Under Review", "Negotiation", ...) is no longer asked for, shown or
-- stored: nothing used it. This removes what was stored of it on sales quotes - the column value,
-- its copy in the document and the two keys history lines carried (substatus, fromSubstatus).
-- Nothing else of a quote changes: not updated_at, not data_version, no other key. The column
-- itself stays (always NULL from now on), so the lifecycle functions of 0004 keep working.
-- Safe to run again: a second run finds nothing to change.
UPDATE "quote" SET
  "substatus" = NULL,
  "data" = CASE WHEN jsonb_typeof("data") = 'object' THEN
    ("data" - 'substatus') || CASE WHEN jsonb_typeof("data"->'timeline') = 'array' THEN
      jsonb_build_object('timeline', (
        SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(e) = 'object' THEN e - 'substatus' - 'fromSubstatus' ELSE e END ORDER BY ord), '[]'::jsonb)
        FROM jsonb_array_elements("data"->'timeline') WITH ORDINALITY AS t(e, ord)
      ))
    ELSE '{}'::jsonb END
  ELSE "data" END
WHERE "status" IS NOT NULL AND (
  "substatus" IS NOT NULL
  OR (jsonb_typeof("data") = 'object' AND (
    "data" ? 'substatus'
    OR (jsonb_typeof("data"->'timeline') = 'array' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements("data"->'timeline') e
      WHERE jsonb_typeof(e) = 'object' AND (e ? 'substatus' OR e ? 'fromSubstatus')
    ))
  ))
);
