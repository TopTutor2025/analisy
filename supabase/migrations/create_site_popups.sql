-- Tabella popup promozionali
CREATE TABLE IF NOT EXISTS site_popups (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  cta_text    TEXT NOT NULL DEFAULT 'Scopri i piani',
  cta_url     TEXT NOT NULL DEFAULT '/dashboard.html',
  active      BOOLEAN NOT NULL DEFAULT false,
  show_on     TEXT NOT NULL DEFAULT 'all',  -- 'all' | 'home' | 'situation-room'
  delay_sec   INTEGER NOT NULL DEFAULT 3,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Solo un popup attivo alla volta: trigger che disattiva gli altri
CREATE OR REPLACE FUNCTION deactivate_other_popups()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.active = true THEN
    UPDATE site_popups SET active = false WHERE id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_single_active_popup ON site_popups;
CREATE TRIGGER trg_single_active_popup
  AFTER INSERT OR UPDATE OF active ON site_popups
  FOR EACH ROW EXECUTE FUNCTION deactivate_other_popups();

-- RLS: lettura pubblica, scrittura solo service role
ALTER TABLE site_popups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read site_popups"  ON site_popups FOR SELECT USING (true);
CREATE POLICY "service write site_popups" ON site_popups FOR ALL USING (auth.role() = 'service_role');
