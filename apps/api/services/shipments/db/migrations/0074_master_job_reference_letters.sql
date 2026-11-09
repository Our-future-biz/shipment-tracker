-- A master job's reference says what it is, by its Load Type (lib/masterJobNumber, owner decision
-- 9 Nov 2026): MCZ00000007 → MCZCONSOL00000007, MCZFULL…, MCZPROJECT…, the number kept. Archived
-- master jobs too, so a number reads the same everywhere. One without a Load Type stays plain until
-- it gets one. Everything else links to a master job by its id, so nothing else has to follow.
UPDATE "master_job"
SET "mcz_number" = 'MCZ'
  || CASE lower(btrim("load_type"))
       WHEN 'consolidation' THEN 'CONSOL'
       WHEN 'full load' THEN 'FULL'
       WHEN 'project shipment' THEN 'PROJECT'
     END
  || substring("mcz_number" from '^MCZ([0-9]+)$')
WHERE "mcz_number" ~ '^MCZ[0-9]+$'
  AND lower(btrim("load_type")) IN ('consolidation', 'full load', 'project shipment');
