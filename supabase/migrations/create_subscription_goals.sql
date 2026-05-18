-- Tabella obiettivi abbonamenti (barra progresso sulla mappa)
CREATE TABLE IF NOT EXISTS subscription_goals (
  id            UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  target_count  INTEGER NOT NULL DEFAULT 100,
  label         TEXT    NOT NULL DEFAULT 'abbonati per sostenere il servizio',
  show_in_popup BOOLEAN NOT NULL DEFAULT false,
  active        BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Solo un obiettivo attivo alla volta
CREATE OR REPLACE FUNCTION deactivate_other_goals()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.active = true THEN
    UPDATE subscription_goals SET active = false WHERE id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_single_active_goal ON subscription_goals;
CREATE TRIGGER trg_single_active_goal
  AFTER INSERT OR UPDATE OF active ON subscription_goals
  FOR EACH ROW EXECUTE FUNCTION deactivate_other_goals();

-- RLS: lettura pubblica, scrittura solo service role
ALTER TABLE subscription_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read goals"   ON subscription_goals;
DROP POLICY IF EXISTS "service write goals" ON subscription_goals;
CREATE POLICY "public read goals"   ON subscription_goals FOR SELECT USING (true);
CREATE POLICY "service write goals" ON subscription_goals FOR ALL   USING (auth.role() = 'service_role');
