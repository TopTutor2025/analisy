-- =========================================================
--  Migrazione: aggiungi views e likes alla tabella articles
--
--  Da eseguire nel SQL Editor di Supabase:
--  Dashboard → SQL Editor → Nuovo query → Esegui
-- =========================================================

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS views INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS likes INT DEFAULT 0;

-- Funzioni RPC per incremento atomico (sicuro con traffico concorrente)
CREATE OR REPLACE FUNCTION increment_article_views(article_id TEXT)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE articles SET views = COALESCE(views, 0) + 1 WHERE id::text = article_id;
$$;

CREATE OR REPLACE FUNCTION increment_article_likes(article_id TEXT)
RETURNS int LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE articles SET likes = COALESCE(likes, 0) + 1
  WHERE id::text = article_id
  RETURNING likes;
$$;

CREATE OR REPLACE FUNCTION decrement_article_likes(article_id TEXT)
RETURNS int LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE articles SET likes = GREATEST(COALESCE(likes, 0) - 1, 0)
  WHERE id::text = article_id
  RETURNING likes;
$$;

-- ─── Verifica ────────────────────────────────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'articles'
  AND column_name IN ('views', 'likes');
