-- Until now the manual follow-up tasks of a company were ONE JSON list in sales_preference
-- (pref_key 'followup_tasks'), replaced whole by every change. They become rows of followup_task
-- (0002). This migration only installs the function that copies a company's list; it copies
-- NOTHING itself. The list keeps accepting writes for as long as code from before this change is
-- running, so the copy is made by the new code - which refuses those writes - before it first
-- reads or writes a task of the company. The list was written by browsers: every value may be
-- missing, of another type or unreadable, and nothing here may raise.

-- The calendar day a text starts with (YYYY-MM-DD, whatever follows), or NULL: anything that does
-- not start that way, that Postgres cannot read, or that lies outside 2000..2100. The guard of
-- quote_try_date in the quotes database.
CREATE OR REPLACE FUNCTION sales_try_date(v text) RETURNS date
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

-- Copies the old task list of one company into followup_task and returns how many tasks it
-- copied. Once per company: when the company already has a copied task - a deleted one counts -
-- nothing is copied and 0 is returned, so a list changed afterwards is never copied again (its
-- positions shift with every removal and could not be matched). A task is keyed by its position
-- in the list, so tasks that share an id are all kept; the unique index on (company_id,
-- legacy_index) is the last guard against copying one twice. The preference row is neither
-- changed nor deleted: it stays as the archive. Copied tasks have no assignee and no customer
-- link; the company stays the text that was typed. A due date that is not a day, or says more
-- than a day, is kept as a line of the note.
CREATE OR REPLACE FUNCTION sales_import_followup_tasks(p_company uuid) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM followup_task WHERE company_id = p_company AND legacy_index IS NOT NULL) THEN
    RETURN 0;
  END IF;

  INSERT INTO followup_task (company_id, legacy_index, type, customer_label, contact, note, due_date, done_at, created_at, updated_at)
  SELECT p.company_id,
    (t.ord - 1)::integer,
    CASE WHEN t.elem->>'type' IN ('Call', 'Email', 'Visit') THEN t.elem->>'type' ELSE 'Call' END,
    left(coalesce(t.elem->>'company', ''), 300),
    left(coalesce(t.elem->>'contact', ''), 300),
    concat_ws(chr(10),
      nullif(left(coalesce(t.elem->>'note', ''), 4000), ''),
      CASE WHEN btrim(coalesce(t.elem->>'due', '')) <> ''
            AND (d.due IS NULL OR btrim(t.elem->>'due') <> to_char(d.due, 'YYYY-MM-DD'))
        THEN 'Due (as entered): ' || left(t.elem->>'due', 100) END),
    d.due,
    CASE WHEN t.elem->>'status' = 'done' THEN p.updated_at END,
    p.updated_at,
    p.updated_at
  FROM sales_preference p
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.value) = 'array' THEN p.value ELSE '[]'::jsonb END)
      WITH ORDINALITY t(elem, ord)
    CROSS JOIN LATERAL (SELECT sales_try_date(btrim(t.elem->>'due')) AS due) d
  WHERE p.company_id = p_company
    AND p.pref_key = 'followup_tasks'
    AND p.deleted_at IS NULL
    AND jsonb_typeof(t.elem) = 'object'
  ON CONFLICT (company_id, legacy_index) WHERE legacy_index IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
