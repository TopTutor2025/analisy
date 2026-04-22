// =========================================================
//  Edge Function: admin-write
//  Operazioni CRUD admin su tutte le tabelle — solo admin.
//  actions: upsert-article | delete-article | upsert-podcast
//           | delete-podcast | upsert-event | delete-event
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
    const { error } = await db.from('map_events').update({ status: 'expired' }).eq('id', payload.id);
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
    const { data, error } = await db.from('map_events').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) return errorResponse(error.message, 500);
    return corsResponse(data || []);
  }

  return errorResponse('Azione non valida', 400);
});
