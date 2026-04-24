-- =========================================================
--  ANALISY — Cron Jobs (pg_cron + pg_net)
--  Da eseguire una volta sola nel SQL Editor di Supabase
--  Dashboard → SQL Editor → Nuovo query → Esegui
-- =========================================================

-- 1. Abilita le estensioni necessarie
--    (se già abilitate, non fa nulla)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── Rimuovi job esistenti (idempotente) ─────────────────
SELECT cron.unschedule('ai-run-pipeline')     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-run-pipeline');
SELECT cron.unschedule('ai-articles-update')  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-articles-update');

-- ─── ai-run: ogni 6 ore (00:00, 06:00, 12:00, 18:00 UTC) ─
SELECT cron.schedule(
  'ai-run-pipeline',
  '0 */6 * * *',
  format(
    $$
    SELECT net.http_post(
      url     := %L,
      headers := %L::jsonb,
      body    := '{}'::jsonb
    );
    $$,
    'https://ncjvntiacegmlqrtnqvt.supabase.co/functions/v1/ai-run',
    '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5janZudGlhY2VnbWxxcnRucXZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NTk2NDAsImV4cCI6MjA5MjQzNTY0MH0.R2TQ5k7LaSV8o09yUUEXjVVZjzUI3HYOA8YiUBPzQJw"}'
  )
);

-- ─── ai-articles: ogni 2 ore ─────────────────────────────
SELECT cron.schedule(
  'ai-articles-update',
  '0 */2 * * *',
  format(
    $$
    SELECT net.http_post(
      url     := %L,
      headers := %L::jsonb,
      body    := '{}'::jsonb
    );
    $$,
    'https://ncjvntiacegmlqrtnqvt.supabase.co/functions/v1/ai-articles',
    '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5janZudGlhY2VnbWxxcnRucXZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NTk2NDAsImV4cCI6MjA5MjQzNTY0MH0.R2TQ5k7LaSV8o09yUUEXjVVZjzUI3HYOA8YiUBPzQJw"}'
  )
);

-- ─── Verifica job attivi ──────────────────────────────────
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname IN ('ai-run-pipeline', 'ai-articles-update');
