-- =========================================================
--  Migrazione: aggiungi categoria hotspot a map_events
--  Necessaria per eventi di tipo cluster epidemico / sanitario
-- =========================================================

-- 1. Rimuovi il vecchio CHECK constraint sulla colonna category
--    (se esiste) e ricrealo con 'hotspot' incluso
DO $$
BEGIN
  -- Rimuovi tutti i CHECK constraint sulla colonna category di map_events
  DECLARE
    r RECORD;
  BEGIN
    FOR r IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'map_events'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%category%'
    LOOP
      EXECUTE 'ALTER TABLE map_events DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
  END;
END $$;

-- 2. Ricrea il constraint con 'hotspot' incluso
ALTER TABLE map_events
  DROP CONSTRAINT IF EXISTS map_events_category_check;

ALTER TABLE map_events
  ADD CONSTRAINT map_events_category_check
  CHECK (category IN ('geopolitica', 'politica', 'business', 'tecnologia', 'hotspot'));

-- ─── Verifica ────────────────────────────────────────────
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'map_events'::regclass
  AND contype = 'c';
