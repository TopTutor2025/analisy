-- =========================================================
--  ANALISY — Supabase PostgreSQL Schema
-- =========================================================
--  Esegui questo file in: Supabase Dashboard → SQL Editor
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- 1. PROFILES  (estende auth.users di Supabase)
-- ─────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  nome            text    default '',
  cognome         text    default '',
  role            text    not null default 'user'  check (role in ('user','admin')),
  plan            text    not null default 'free'  check (plan in ('free','premium','pro')),
  sub_status      text    not null default 'inactive' check (sub_status in ('inactive','active','trialing','past_due','canceled')),
  stripe_customer text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Trigger: crea automaticamente il profilo ad ogni nuova registrazione
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, nome, cognome)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome',   ''),
    coalesce(new.raw_user_meta_data->>'cognome','')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger: aggiorna updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────
-- 2. ARTICLES
-- ─────────────────────────────────────────────────────────
create table if not exists public.articles (
  id            bigserial primary key,
  title         text    not null,
  subtitle      text    default '',
  content       text    default '',
  cat           text    not null default 'geopolitica',
  cat_label     text    default '',
  author        text    default '',
  read_time     text    default '',
  image         text    default '',
  excerpt       text    default '',
  premium       boolean not null default false,
  status        text    not null default 'draft' check (status in ('draft','published','archived')),
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger articles_updated_at
  before update on public.articles
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────
-- 3. PODCASTS
-- ─────────────────────────────────────────────────────────
create table if not exists public.podcasts (
  id            bigserial primary key,
  title         text    not null,
  author        text    default '',
  duration      text    default '',
  embed_url     text    default '',
  premium       boolean not null default false,
  published_at  timestamptz default now(),
  created_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────
-- 4. CITYCAMS
-- ─────────────────────────────────────────────────────────
create table if not exists public.citycams (
  id                  text primary key,
  flag                text default '',
  name                text not null,
  embed_url           text default '',
  lat                 double precision,
  lng                 double precision,
  ai_priority         integer default 50,
  ai_event_title      text default '',
  ai_event_category   text default '',
  ai_lock             boolean not null default false,  -- se true: l'IA non tocca questa cam
  active              boolean not null default true,
  updated_at          timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────
-- 5. MAP EVENTS  (popolati dall'IA)
-- ─────────────────────────────────────────────────────────
create table if not exists public.map_events (
  id              text primary key default gen_random_uuid()::text,
  title           text    not null,
  description     text    default '',
  lat             double precision not null,
  lng             double precision not null,
  category        text    not null default 'geopolitica'
                  check (category in ('geopolitica','politica','business','tecnologia')),
  magnitude       integer not null default 2 check (magnitude between 1 and 4),
  status          text    not null default 'active'
                  check (status in ('active','resolved','expired')),
  ai_summary      text    default '',
  ai_brief        text    default '',
  source_url      text    default '',
  relevance_score integer default 75 check (relevance_score between 0 and 100),
  manual_lock     boolean not null default false,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger map_events_updated_at
  before update on public.map_events
  for each row execute function public.set_updated_at();

-- Index per query frequenti
create index if not exists map_events_status_idx    on public.map_events(status);
create index if not exists map_events_category_idx  on public.map_events(category);
create index if not exists map_events_created_idx   on public.map_events(created_at desc);

-- ─────────────────────────────────────────────────────────
-- 6. MAP RESOURCES  (dati statici, gestiti dall'admin)
-- ─────────────────────────────────────────────────────────
create table if not exists public.map_resources (
  id      text primary key,
  name    text not null,
  type    text not null check (type in ('oil','gas','lithium','uranium')),
  lat     double precision not null,
  lng     double precision not null,
  radius  integer default 200000,
  notes   text default ''
);

-- ─────────────────────────────────────────────────────────
-- 7. FORUM POSTS
-- ─────────────────────────────────────────────────────────
create table if not exists public.forum_posts (
  id           bigserial primary key,
  user_id      uuid references auth.users(id) on delete set null,
  author_name  text    not null default '',
  title        text    not null,
  content      text    not null,
  category     text    default 'generale',
  upvotes      integer not null default 0,
  replies_count integer not null default 0,
  status       text    not null default 'published'
               check (status in ('published','hidden','deleted')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────
-- 7b. FORUM REPLIES
-- ─────────────────────────────────────────────────────────
create table if not exists public.forum_replies (
  id           bigserial primary key,
  post_id      bigint not null references public.forum_posts(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  author_name  text    not null default '',
  body         text    not null,
  status       text    not null default 'published'
               check (status in ('published','hidden','deleted')),
  created_at   timestamptz not null default now()
);

create index if not exists forum_replies_post_idx on public.forum_replies(post_id);

-- Trigger: aggiorna replies_count su forum_posts
create or replace function public.update_replies_count()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update public.forum_posts set replies_count = replies_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' or (TG_OP = 'UPDATE' and NEW.status = 'deleted' and OLD.status != 'deleted') then
    update public.forum_posts set replies_count = greatest(0, replies_count - 1) where id = coalesce(NEW.post_id, OLD.post_id);
  end if;
  return coalesce(NEW, OLD);
end;
$$;

create trigger forum_replies_count_trigger
  after insert or update or delete on public.forum_replies
  for each row execute function public.update_replies_count();

-- ─────────────────────────────────────────────────────────
-- 7c. FORUM REPORTS  (segnalazioni contenuti)
-- ─────────────────────────────────────────────────────────
create table if not exists public.forum_reports (
  id            bigserial primary key,
  reporter_id   uuid references auth.users(id) on delete set null,
  content_type  text not null check (content_type in ('post','reply')),
  content_id    text not null,
  author_id     text default '',
  author_name   text default '',
  content_text  text default '',
  reason        text not null,
  status        text not null default 'pending'
                check (status in ('pending','reviewed','dismissed')),
  created_at    timestamptz not null default now()
);

create trigger forum_posts_updated_at
  before update on public.forum_posts
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────
-- 8. AI JOBS  (log delle esecuzioni dell'IA)
-- ─────────────────────────────────────────────────────────
create table if not exists public.ai_jobs (
  id                  bigserial primary key,
  status              text not null default 'running'
                      check (status in ('running','completed','failed')),
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  articles_processed  integer default 0,
  events_created      integer default 0,
  events_renewed      integer default 0,
  events_resolved     integer default 0,
  error_message       text default ''
);

-- ─────────────────────────────────────────────────────────
-- 9. SUBSCRIPTIONS  (Stripe webhook aggiorna questa tabella)
-- ─────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id                  bigserial primary key,
  user_id             uuid references auth.users(id) on delete cascade,
  stripe_customer_id  text,
  stripe_sub_id       text unique,
  plan                text not null default 'free',
  status              text not null default 'inactive',
  current_period_end  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- =========================================================
--  ROW LEVEL SECURITY (RLS)
-- =========================================================

-- Abilita RLS su tutte le tabelle
alter table public.profiles       enable row level security;
alter table public.articles        enable row level security;
alter table public.podcasts        enable row level security;
alter table public.citycams        enable row level security;
alter table public.map_events      enable row level security;
alter table public.map_resources   enable row level security;
alter table public.forum_posts     enable row level security;
alter table public.forum_replies   enable row level security;
alter table public.forum_reports   enable row level security;
alter table public.ai_jobs         enable row level security;
alter table public.subscriptions   enable row level security;

-- ── profiles ──────────────────────────────────────────────
create policy "Utente vede solo il proprio profilo"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Utente aggiorna solo il proprio profilo"
  on public.profiles for update
  using (auth.uid() = id);

-- ── articles ──────────────────────────────────────────────
create policy "Articoli pubblicati visibili a tutti"
  on public.articles for select
  using (status = 'published');

-- ── podcasts ──────────────────────────────────────────────
create policy "Podcast visibili a tutti"
  on public.podcasts for select
  using (true);

-- ── citycams ──────────────────────────────────────────────
create policy "CityCams visibili a tutti"
  on public.citycams for select
  using (active = true);

-- ── map_events ────────────────────────────────────────────
create policy "Eventi attivi visibili a tutti"
  on public.map_events for select
  using (status = 'active');

-- ── map_resources ─────────────────────────────────────────
create policy "Risorse visibili a tutti"
  on public.map_resources for select
  using (true);

-- ── forum_posts ───────────────────────────────────────────
create policy "Post pubblicati visibili ai loggati"
  on public.forum_posts for select
  using (status = 'published' and auth.uid() is not null);

create policy "Utenti Pro possono scrivere post"
  on public.forum_posts for insert
  with check (auth.uid() = user_id);

create policy "Autore o admin può eliminare post"
  on public.forum_posts for update
  using (auth.uid() = user_id);

-- ── forum_replies ─────────────────────────────────────────
create policy "Risposte visibili ai loggati"
  on public.forum_replies for select
  using (status = 'published' and auth.uid() is not null);

create policy "Utenti loggati possono rispondere"
  on public.forum_replies for insert
  with check (auth.uid() = user_id);

create policy "Autore può modificare la propria risposta"
  on public.forum_replies for update
  using (auth.uid() = user_id);

-- ── forum_reports ─────────────────────────────────────────
create policy "Utenti loggati possono segnalare"
  on public.forum_reports for insert
  with check (auth.uid() = reporter_id);

create policy "Solo admin vede le segnalazioni"
  on public.forum_reports for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ── ai_jobs ───────────────────────────────────────────────
-- Solo Edge Functions (service role) possono scrivere
create policy "ai_jobs lettura admin"
  on public.ai_jobs for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ── subscriptions ─────────────────────────────────────────
create policy "Utente vede solo la propria subscription"
  on public.subscriptions for select
  using (user_id = auth.uid());

-- =========================================================
--  ADMIN HELPER: Funzione per promuovere utente ad admin
--  Uso: select promote_to_admin('email@esempio.com');
-- =========================================================
create or replace function public.promote_to_admin(target_email text)
returns void language plpgsql security definer as $$
declare
  target_id uuid;
begin
  select id into target_id from auth.users where email = target_email limit 1;
  if target_id is null then
    raise exception 'Utente non trovato: %', target_email;
  end if;
  update public.profiles set role = 'admin' where id = target_id;
end;
$$;

-- =========================================================
--  ADMIN HELPER: Imposta il piano di un utente
--  Uso: select set_user_plan('email@esempio.com', 'pro');
-- =========================================================
create or replace function public.set_user_plan(target_email text, new_plan text)
returns void language plpgsql security definer as $$
declare
  target_id uuid;
begin
  select id into target_id from auth.users where email = target_email limit 1;
  if target_id is null then
    raise exception 'Utente non trovato: %', target_email;
  end if;
  update public.profiles
    set plan = new_plan, sub_status = case when new_plan = 'free' then 'inactive' else 'active' end
  where id = target_id;
end;
$$;
