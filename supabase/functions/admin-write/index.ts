// =========================================================
//  Edge Function: admin-write
//  Operazioni CRUD admin su tutte le tabelle — solo admin.
//  actions: upsert-article | delete-article | upsert-podcast
//           | delete-podcast | upsert-event | delete-event
//           | bulk-delete-events | lock-event | resolve-event
//           | extend-event | reactivate-event
//           | upsert-resource | delete-resource
//           | update-user | delete-user | dismiss-report
//           | delete-forum-content
// =========================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Non autenticato', 401);

  // Verifica admin via anon client
  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await anonClient.auth.getUser();
  if (!user) return errorResponse('Non autenticato', 401);

  const { data: profile } = await anonClient.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return errorResponse('Accesso negato', 403);

  // Client service role per bypassare RLS
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const body = await req.json().catch(() => ({}));
  const { action, data: payload } = body;

  // ── ARTICLES ──────────────────────────────────────────
  if (action === 'upsert-article') {
    const { id, ...fields } = payload;
    let result;
    if (id) {
      result = await db.from('articles').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    } else {
      result = await db.from('articles').insert(fields).select().single();
    }
    if (result.error) return errorResponse(result.error.message, 500);
    return corsResponse(result.data);
  }

  if (action === 'delete-article') {
    const { error } = await db.from('articles').delete().eq('id', payload.id);
    if (error) return errorResponse(error.message, 500);
    return corsResponse({ ok: true });
  }

  // ── PODCASTS ──────────────────────────────────────────
  if (action === 'upsert-podcast') {
    const { id, ...fields } = payload;
    let result;
    if (id) {
      result = await db.from('podcasts').update(fields).eq('id', id).select().single();
    } else {
      result = await db.from('podcasts').insert(fields).select().single();
    }
    if (result.error) return errorResponse(result.error.message, 500);
    return corsResponse(result.data);
  }

  if (action === 'delete-podcast') {
    const { error } = await db.from('podcasts').delete().eq('id', payload.id);
    if (error) return errorResponse(error.message, 500);
    return corsResponse({ ok: true });
  }

  // ── MAP EVENTS ────────────────────────────────────────
  if (action === 'upsert-event') {
    const { id, ...fields } = payload;
    let result;
    if (id) {
      result = await db.from('map_events').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    } else {
      result = await db.from('map_events').insert(fields).select().single();
    }
    if (result.error) return errorResponse(result.error.message, 500);
    return corsResponse(result.data);
  }

  if (action === 'delete-event') {
    const { error } = await db.from('map_events').delete().eq('id', payload.id);
    if (error) return errorResponse(error.message, 500);
    return corsResponse({ ok: true });
  }

  if (action === 'bulk-delete-events') {
    // Elimina più eventi in una singola query DB
    const ids: string[] = Array.isArray(payload.ids) ? payload.ids : [];
    if (!ids.length) return corsResponse({ ok: true, deleted: 0 });
    const { error, count } = await db
      .from('map_events')
      .delete({ count: 'exact' })
      .in('id', ids);
    if (error) return errorResponse(error.message, 500);
    return corsResponse({ ok: true, deleted: count ?? ids.length });
  }

  if (action === 'lock-event') {
    // Toggle manual_lock
    const { data: ev } = await db.from('map_events').select('manual_lock').eq('id', payload.id).single();
    const newLock = !(ev?.manual_lock ?? false);
    const { error } = await db.from('map_events').update({ manual_lock: newLock }).eq('id', payload.id);
    if (error) return errorResponse(error.message, 500);
    return corsResponse({ ok: true, manual_lock: newLock });
  }

  if (action === 'resolve-event') {
    const { error } = await db.from('map_events').update({ status: 'resolved' }).eq('id', payload.id);
    if (error) return errorResponse(error.message, 500);
    return corsResponse({ ok: true });
  }

  if (action === 'extend-event') {
    // Estende la scadenza di 48 ore dalla data attuale
    const newExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const { error } = await db.from('map_events').update({ expires_at: newExpiry, status: 'active' }).eq('id', payload.id);
    if (error) return errorResponse(error.message, 500);
    return corsResponse({ ok: true, expires_at: newExpiry });
  }

  if (action === 'reactivate-event') {
    const newExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const { error } = await db.from('map_events').update({ status: 'active', expires_at: newExpiry }).eq('id', payload.id);
    if (error) return errorResponse(error.message, 500);
    return corsResponse({ ok: true });
  }

  // ── MAP RESOURCES ─────────────────────────────────────
  if (action === 'upsert-resource') {
    const { id, ...fields } = payload;
    let result;
    if (id) {
      result = await db.from('map_resources').update(fields).eq('id', id).select().single();
    } else {
      result = await db.from('map_resources').insert(fields).select().single();
    }
    if (result.error) return errorResponse(result.error.message, 500);
    return corsResponse(result.data);
  }

  if (action === 'delete-resource') {
    const { error } = await db.from('map_resources').delete().eq('id', payload.id);
    if (error) return errorResponse(error.message, 500);
    return corsResponse({ ok: true });
  }

  // ── USERS ─────────────────────────────────────────────
  if (action === 'update-user') {
    const { id, ...fields } = payload;
    const allowed = ['role', 'plan', 'sub_status', 'nome', 'cognome'];
    const safe = Object.fromEntries(Object.entries(fields).filter(([k]) => allowed.includes(k)));
    const { error } = await db.from('profiles').update(safe).eq('id', id);
    if (error) return errorResponse(error.message, 500);
    return corsResponse({ ok: true });
  }

  if (action === 'delete-user') {
    const { error } = await db.auth.admin.deleteUser(payload.id);
    if (error) return errorResponse(error.message, 500);
    return corsResponse({ ok: true });
  }

  // ── FORUM REPORTS ─────────────────────────────────────
  if (action === 'list-reports') {
    const { data, error } = await db.from('forum_reports').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) return errorResponse(error.message, 500);
    return corsResponse(data || []);
  }

  if (action === 'dismiss-report') {
    const { error } = await db.from('forum_reports').update({ status: 'dismissed' }).eq('id', payload.id);
    if (error) return errorResponse(error.message, 500);
    return corsResponse({ ok: true });
  }

  if (action === 'delete-forum-content') {
    const { contentType, contentId, reportId } = payload;
    const table = contentType === 'post' ? 'forum_posts' : 'forum_replies';
    await db.from(table).update({ status: 'deleted' }).eq('id', contentId);
    if (reportId) await db.from('forum_reports').update({ status: 'reviewed' }).eq('id', reportId);
    return corsResponse({ ok: true });
  }

  // ── AI STATUS ─────────────────────────────────────────
  if (action === 'ai-status') {
    const { data: jobs } = await db.from('ai_jobs').select('*').order('started_at', { ascending: false }).limit(1);
    const last = jobs?.[0];
    const { count } = await db.from('ai_jobs').select('*', { count: 'exact', head: true });
    const { data: events } = await db.from('map_events').select('id', { count: 'exact', head: false }).eq('status', 'active');
    return corsResponse({
      lastJob: last || null,
      isRunning: last?.status === 'running',
      stats: { totalJobs: count || 0, activeEvents: events?.length || 0 }
    });
  }

  if (action === 'ai-jobs') {
    const { data, error } = await db.from('ai_jobs').select('*').order('started_at', { ascending: false }).limit(25);
    if (error) return errorResponse(error.message, 500);
    return corsResponse(data || []);
  }

  if (action === 'ai-events') {
    const { data, error } = await db.from('map_events').select('*').order('created_at', { ascending: false }).limit(300);
    if (error) return errorResponse(error.message, 500);
    return corsResponse(data || []);
  }

  // ── NOTIFICATIONS ─────────────────────────────────────
  if (action === 'list-notifications') {
    const { data, error } = await db
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return errorResponse(error.message, 500);
    return corsResponse(data || []);
  }

  if (action === 'upsert-notification') {
    const { id, title, body, type, expires_at } = payload;
    const fields = {
      title,
      body,
      type:       type || 'info',
      expires_at: expires_at || null,
      updated_at: new Date().toISOString(),
    };
    let result;
    if (id) {
      result = await db.from('notifications').update(fields).eq('id', id).select().single();
    } else {
      result = await db.from('notifications').insert(fields).select().single();
    }
    if (result.error) return errorResponse(result.error.message, 500);
    return corsResponse(result.data);
  }

  if (action === 'delete-notification') {
    const { error } = await db.from('notifications').delete().eq('id', payload.id);
    if (error) return errorResponse(error.message, 500);
    return corsResponse({ ok: true });
  }

  // ── SITE POPUPS ───────────────────────────────────────
  if (action === 'list-popups') {
    const { data, error } = await db.from('site_popups').select('*').order('created_at', { ascending: false });
    if (error) return errorResponse(error.message, 500);
    return corsResponse(data || []);
  }

  if (action === 'upsert-popup') {
    const { id, title, body, cta_text, cta_url, active, show_on, delay_sec } = payload;
    const fields = {
      title:     title     || '',
      body:      body      || '',
      cta_text:  cta_text  || 'Scopri i piani',
      cta_url:   cta_url   || '/dashboard.html',
      active:    active    ?? false,
      show_on:   show_on   || 'all',
      delay_sec: delay_sec ?? 3,
      updated_at: new Date().toISOString(),
    };
    let result;
    if (id) {
      result = await db.from('site_popups').update(fields).eq('id', id).select().single();
    } else {
      result = await db.from('site_popups').insert(fields).select().single();
    }
    if (result.error) return errorResponse(result.error.message, 500);
    // Se attivato, disattiva gli altri
    if (fields.active && result.data?.id) {
      await db.from('site_popups').update({ active: false }).neq('id', result.data.id);
    }
    return corsResponse(result.data);
  }

  if (action === 'toggle-popup') {
    const { id, active } = payload;
    const { error } = await db.from('site_popups').update({ active: !!active, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return errorResponse(error.message, 500);
    if (active) await db.from('site_popups').update({ active: false }).neq('id', id);
    return corsResponse({ ok: true });
  }

  if (action === 'delete-popup') {
    const { error } = await db.from('site_popups').delete().eq('id', payload.id);
    if (error) return errorResponse(error.message, 500);
    return corsResponse({ ok: true });
  }

  return errorResponse('Azione non valida', 400);
});
