-- =========================================================
--  Migrazione: aggiungi colonna suggested alla tabella articles
--  Contiene gli ID degli articoli correlati, separati da virgola
--  Es: "3, 7, 12"
--
--  Da eseguire nel SQL Editor di Supabase:
--  Dashboard → SQL Editor → Nuovo query → Esegui
-- =========================================================

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS suggested TEXT DEFAULT NULL;

-- ─── Verifica ────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'articles'
  AND column_name = 'suggested';
