-- =========================================================
--  Migrazione: crea tabella notifications
--  Comunicazioni del team Analisy agli utenti
-- =========================================================

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'info'
                CHECK (type IN ('info', 'warning', 'alert')),
  expires_at  TIMESTAMPTZ,                   -- NULL = nessuna scadenza
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tutti possono leggere, solo service role può scrivere
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read notifications"
  ON notifications FOR SELECT USING (true);

-- Indice per filtrare le scadute
CREATE INDEX IF NOT EXISTS idx_notifications_expires
  ON notifications (expires_at)
  WHERE expires_at IS NOT NULL;
