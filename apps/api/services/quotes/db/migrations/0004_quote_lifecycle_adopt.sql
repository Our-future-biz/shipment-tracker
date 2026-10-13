-- The lifecycle facts of a sales quote (status, sent and decision dates, validity, owner) live in
-- its JSON document. These functions copy them into the columns added by 0003 ("adoption").
-- Documents were written by browsers for a long time, so every value may be missing, of another
-- type or unreadable: nothing here may raise - a failed migration leaves the database marked
-- dirty - and whatever cannot be read becomes NULL. Timestamps are read with the time zone pinned
-- to UTC, so a value stored without a zone means the same on every server and in every session.

-- A timestamp from text, or NULL: anything that does not start with YYYY-MM-DD, that Postgres
-- cannot read, or that lies outside 2000..2100.
CREATE OR REPLACE FUNCTION quote_try_timestamptz(v text) RETURNS timestamptz
LANGUAGE plpgsql STABLE SET timezone = 'UTC' AS $$
DECLARE r timestamptz;
BEGIN
  IF v IS NULL OR v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN RETURN NULL; END IF;
  BEGIN
    r := v::timestamptz;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  IF r < timestamptz '2000-01-01 00:00:00+00' OR r >= timestamptz '2100-01-01 00:00:00+00' THEN RETURN NULL; END IF;
  RETURN r;
END $$;
--> statement-breakpoint

-- The calendar day a text starts with (YYYY-MM-DD, whatever follows), or NULL under the same rules.
CREATE OR REPLACE FUNCTION quote_try_date(v text) RETURNS date
LANGUAGE plpgsql STABLE AS $$
DECLARE r date;
BEGIN
  IF v IS NULL OR v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN RETURN NULL; END IF;
  BEGIN
    r := left(v, 10)::date;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  IF r < date '2000-01-01' OR r >= date '2100-01-01' THEN RETURN NULL; END IF;
  RETURN r;
END $$;
--> statement-breakpoint

-- A whole number within lo..hi (also written 15.0), or NULL. The nested CASE keeps the cast
-- behind the pattern check, so it never sees text it could fail on.
CREATE OR REPLACE FUNCTION quote_try_int(v text, lo integer, hi integer) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v ~ '^[0-9]{1,9}([.]0+)?$' THEN
    CASE WHEN split_part(v, '.', 1)::integer BETWEEN lo AND hi THEN split_part(v, '.', 1)::integer END
  END
$$;
--> statement-breakpoint

-- THE ONE DERIVATION: the lifecycle facts of one document. Always exactly one row - the timeline
-- is read by scalar sub-selects, never joined, so a quote without a timeline, or with several
-- entries, is still one row. The status is copied (trimmed, lower-cased, cut to 40 characters so
-- the index can never reject it), never interpreted: unknown text and a stored 'expired' stay what
-- they are. A document without a status is not a sales quote and gives NULLs.
CREATE OR REPLACE FUNCTION quote_lifecycle_of(p jsonb,
  OUT status text, OUT substatus text, OUT lost_reason text, OUT lost_comment text,
  OUT sent_at timestamptz, OUT first_sent_at timestamptz, OUT decided_at timestamptz,
  OUT valid_until date, OUT last_contact_at timestamptz, OUT owner_label text)
LANGUAGE sql STABLE SET timezone = 'UTC' AS $$
  WITH b AS (
    SELECT d,
      CASE WHEN jsonb_typeof(d->'quoteStatus') = 'string' AND btrim(d->>'quoteStatus') <> '' THEN left(lower(btrim(d->>'quoteStatus')), 40) END AS st,
      quote_try_timestamptz(CASE WHEN jsonb_typeof(d->'sentAt') = 'string' THEN d->>'sentAt' END) AS sent,
      CASE WHEN jsonb_typeof(d->'timeline') = 'array' THEN d->'timeline' ELSE '[]'::jsonb END AS tl
    FROM (SELECT CASE WHEN jsonb_typeof(p) = 'object' THEN p ELSE '{}'::jsonb END AS d) x
  ), t AS (
    SELECT
      (SELECT min(quote_try_timestamptz(e->>'at')) FROM jsonb_array_elements(b.tl) e WHERE jsonb_typeof(e) = 'object' AND e->>'status' = 'quoted') AS first_quoted,
      (SELECT max(quote_try_timestamptz(e->>'at')) FROM jsonb_array_elements(b.tl) e WHERE jsonb_typeof(e) = 'object' AND (e->>'status' = 'feedback' OR e->>'kind' = 'follow_up')) AS last_contact,
      (SELECT max(quote_try_timestamptz(e->>'at')) FROM jsonb_array_elements(b.tl) e WHERE jsonb_typeof(e) = 'object' AND e->>'status' = b.st) AS last_same
    FROM b
  )
  SELECT b.st,
    CASE WHEN b.st IS NOT NULL AND jsonb_typeof(b.d->'substatus') = 'string' THEN nullif(left(btrim(b.d->>'substatus'), 200), '') END,
    CASE WHEN b.st IS NOT NULL AND jsonb_typeof(b.d->'lostReason') = 'string' THEN nullif(left(btrim(b.d->>'lostReason'), 500), '') END,
    CASE WHEN b.st IS NOT NULL AND jsonb_typeof(b.d->'lostComment') = 'string' THEN nullif(left(btrim(b.d->>'lostComment'), 4000), '') END,
    CASE WHEN b.st IS NOT NULL THEN b.sent END,
    -- The first time the quote went out: its oldest 'quoted' entry, or the sent date when the
    -- timeline does not go back that far.
    CASE WHEN b.st IS NOT NULL THEN LEAST(t.first_quoted, b.sent) END,
    -- Quotes decided before the date was recorded take it from their last entry of that status.
    CASE WHEN b.st IN ('won', 'lost') THEN coalesce(quote_try_timestamptz(CASE WHEN jsonb_typeof(b.d->'decidedAt') = 'string' THEN b.d->>'decidedAt' END), t.last_same) END,
    -- Quotes sent as "valid N days" carry no date: it is the sent day (in Prague) + N.
    CASE WHEN b.st IS NOT NULL THEN coalesce(
      quote_try_date(CASE WHEN jsonb_typeof(b.d->'validUntil') = 'string' THEN b.d->>'validUntil' END),
      (b.sent AT TIME ZONE 'Europe/Prague')::date + quote_try_int(b.d->>'validityDays', 1, 3650)) END,
    CASE WHEN b.st IN ('quoted', 'feedback') THEN GREATEST(b.sent, t.last_contact) END,
    CASE WHEN b.st IS NOT NULL AND jsonb_typeof(b.d->'salesOwner') = 'string' THEN left(btrim(b.d->>'salesOwner'), 200) ELSE '' END
  FROM b, t
$$;
--> statement-breakpoint

-- Fills the columns from the documents and returns the number of rows it changed. Safe to run at
-- any time and any number of times (a second call returns 0); deleted rows are adopted too. It
-- never writes data, updated_at, data_version, shipment_* or deleted_*.
--   (1) always: sales quotes never adopted - the predicate of quote_unadopted_idx, word for word,
--       so "nothing is waiting" is an index probe;
--   (2) only with p_include_drifted: adopted rows whose mirrored facts differ from their document.
--       Facts that exist only in the columns are merged, never lowered, and a changed owner label
--       drops the user it was matched to.
-- The row is joined to itself because UPDATE cannot hand its own row to a function in FROM. A row
-- changed by another transaction while the statement waited for it is re-checked on the q side
-- only, hence q.data = s.data: values derived from a document that is no longer the stored one
-- are not written; that row is picked up by the next call.
CREATE OR REPLACE FUNCTION quote_adopt_lifecycle(p_company uuid DEFAULT NULL, p_include_drifted boolean DEFAULT false, p_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SET timezone = 'UTC' AS $$
DECLARE n integer := 0; m integer := 0;
BEGIN
  UPDATE quote q SET
    status = d.status, substatus = d.substatus, lost_reason = d.lost_reason, lost_comment = d.lost_comment,
    sent_at = d.sent_at, first_sent_at = d.first_sent_at, decided_at = d.decided_at,
    valid_until = d.valid_until, last_contact_at = d.last_contact_at, owner_label = d.owner_label
  FROM quote s CROSS JOIN LATERAL quote_lifecycle_of(s.data) d
  WHERE q.id = s.id AND q.data = s.data
    AND s.status IS NULL AND jsonb_typeof(s.data->'quoteStatus') = 'string' AND btrim(s.data->>'quoteStatus') <> ''
    AND (p_company IS NULL OR s.company_id = p_company) AND (p_id IS NULL OR s.id = p_id)
    AND d.status IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF p_include_drifted THEN
    UPDATE quote q SET
      status = d.status, substatus = d.substatus, lost_reason = d.lost_reason, lost_comment = d.lost_comment,
      sent_at = d.sent_at, decided_at = d.decided_at, valid_until = d.valid_until,
      first_sent_at = LEAST(q.first_sent_at, d.first_sent_at),
      last_contact_at = GREATEST(q.last_contact_at, d.last_contact_at),
      owner_label = d.owner_label,
      owner_user_id = CASE WHEN q.owner_label IS DISTINCT FROM d.owner_label THEN NULL ELSE q.owner_user_id END,
      owner_match_checked_at = CASE WHEN q.owner_label IS DISTINCT FROM d.owner_label THEN NULL ELSE q.owner_match_checked_at END
    FROM quote s CROSS JOIN LATERAL quote_lifecycle_of(s.data) d
    WHERE q.id = s.id AND q.data = s.data
      AND s.status IS NOT NULL AND d.status IS NOT NULL
      AND (p_company IS NULL OR s.company_id = p_company) AND (p_id IS NULL OR s.id = p_id)
      AND (s.status IS DISTINCT FROM d.status OR s.substatus IS DISTINCT FROM d.substatus OR s.lost_reason IS DISTINCT FROM d.lost_reason
        OR s.lost_comment IS DISTINCT FROM d.lost_comment OR s.sent_at IS DISTINCT FROM d.sent_at OR s.decided_at IS DISTINCT FROM d.decided_at
        OR s.valid_until IS DISTINCT FROM d.valid_until OR s.owner_label IS DISTINCT FROM d.owner_label);
    GET DIAGNOSTICS m = ROW_COUNT;
  END IF;
  RETURN n + m;
END $$;
--> statement-breakpoint

-- The proof that columns and documents agree: adopted rows where a mirrored column differs from
-- what the document says, or whose timeline is not a list. Must return nothing; `fields` names
-- what differs.
CREATE OR REPLACE FUNCTION quote_lifecycle_drift(p_company uuid DEFAULT NULL)
RETURNS TABLE (id uuid, quote_number text, fields text)
LANGUAGE sql STABLE SET timezone = 'UTC' AS $$
  SELECT x.id, x.quote_number, x.fields
  FROM (
    SELECT q.id, q.quote_number, concat_ws(', ',
      CASE WHEN q.status IS DISTINCT FROM d.status THEN 'status' END,
      CASE WHEN q.substatus IS DISTINCT FROM d.substatus THEN 'substatus' END,
      CASE WHEN q.lost_reason IS DISTINCT FROM d.lost_reason THEN 'lost_reason' END,
      CASE WHEN q.lost_comment IS DISTINCT FROM d.lost_comment THEN 'lost_comment' END,
      CASE WHEN q.sent_at IS DISTINCT FROM d.sent_at THEN 'sent_at' END,
      CASE WHEN q.decided_at IS DISTINCT FROM d.decided_at THEN 'decided_at' END,
      CASE WHEN q.valid_until IS DISTINCT FROM d.valid_until THEN 'valid_until' END,
      CASE WHEN q.owner_label IS DISTINCT FROM d.owner_label THEN 'owner_label' END,
      CASE WHEN jsonb_typeof(q.data->'timeline') <> 'array' THEN 'timeline' END) AS fields
    FROM quote q CROSS JOIN LATERAL quote_lifecycle_of(q.data) d
    WHERE q.status IS NOT NULL AND (p_company IS NULL OR q.company_id = p_company)
  ) x
  WHERE x.fields <> ''
  ORDER BY x.quote_number
$$;
--> statement-breakpoint

-- The JSON is still the truth, so every sales quote takes its columns from its document.
SELECT quote_adopt_lifecycle(NULL, true);
