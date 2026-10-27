-- Created By holds only who created the shipment (their e-mail); when is the row's created_at,
-- shown as its own "Created on" column. Old stamps were "<cs-CZ date time> — <who>": the date is
-- dropped, and a stamp that is only a date (nobody known) becomes empty. "Trucking · …" stays.
UPDATE "shipment"
SET "created_by" = CASE
  WHEN "created_by" ~ '^[0-9]{1,2}\. ?[0-9]{1,2}\. ?[0-9]{4} [0-9]{1,2}:[0-9]{2}(:[0-9]{2})? — '
    THEN regexp_replace("created_by", '^[0-9]{1,2}\. ?[0-9]{1,2}\. ?[0-9]{4} [0-9]{1,2}:[0-9]{2}(:[0-9]{2})? — ', '')
  ELSE ''
END
WHERE "created_by" ~ '^[0-9]{1,2}\. ?[0-9]{1,2}\. ?[0-9]{4} [0-9]{1,2}:[0-9]{2}(:[0-9]{2})?( — |$)';
