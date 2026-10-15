-- From here on the lifecycle columns are the truth and the server is their only writer. Until now
-- the JSON was: quotes created or changed since 0005 ran have empty or stale columns, so every
-- sales quote takes its columns from its document once more. Safe at any time - facts that exist
-- only in the columns are merged, never lowered, and a second call changes nothing.
SELECT quote_adopt_lifecycle(NULL, true);
