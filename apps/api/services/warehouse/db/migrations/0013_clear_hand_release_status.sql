-- Release follows the release gates only: hand-set release statuses are cleared and the cleared value is logged on the movement. The column is kept.
UPDATE "warehouse_gate_movement"
SET "events" = "events" || jsonb_build_array(jsonb_build_object(
      'kind', 'releaseStatusCleared',
      'label', 'Hand-set release status "' || "release_status" || '" cleared — release now follows the gates',
      'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'by', 'system')),
    "release_status" = '',
    "updated_at" = now()
WHERE "release_status" <> '';
