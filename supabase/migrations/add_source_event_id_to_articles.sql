-- =========================================================
--  Migrazione: aggiungi source_event_id alla tabella articles
--  Necessaria per la deduplicazione degli articoli AI
--
--  Da eseguire nel SQL Editor di Supabase:
--  Dashboard → SQL Editor → Nuovo query → Esegui
-- =========================================================

-- 1. Aggiungi colonna (idempotente)
--    map_events.id è TEXT, quindi source_event_id deve essere TEXT
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS source_event_id TEXT
  REFERENCES map_events(id) ON DELETE CASCADE;

-- 2. Indice per lookup veloce (JOIN in Edge Function)
CREATE INDEX IF NOT EXISTS idx_articles_source_event_id
  ON articles(source_event_id)
  WHERE source_event_id IS NOT NULL;

-- 3. Pulisci eventuali articoli AI duplicati già presenti:
--    per ogni source_event_id mantieni solo il più recente,
--    elimina i duplicati (per articoli AI senza source_event_id
--    che si sono accumulati in precedenza).
DELETE FROM articles
WHERE author = 'AI Intelligence · Analisy'
  AND source_event_id IS NULL;

-- ─── Verifica ────────────────────────────────────────────
SELECT COUNT(*) AS ai_articles_remaining
FROM articles
WHERE author = 'AI Intelligence · Analisy';
