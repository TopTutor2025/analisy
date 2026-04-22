// =========================================================
//  Edge Function: forum-posts
//  actions: list | create | delete
// =========================================================
//  list   → tutti, auth richiesta (solo utenti loggati leggono)
//  create → richiede plan pro o admin
//  delete → richiede essere l'autore oppure admin
// =========================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const body   = await req.json().catch(() => ({}));
  const action = body.action || 'list';

  const authHeader = req.headers.get('Authorization');

  // Client autenticato (necessario per leggere — RLS richiede auth)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    authHeader ? { global: { headers: { Authorization: authHeader } } } : {}
  );

  // ── LIST ────────────────────────────────────────────────
  if (action === 'list') {
    const { data, error } = await supabase
      .from('forum_posts')
      .select('id, user_id, author_name, title, content, category, upvotes, replies_count, created_at')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return errorResponse(error.message, 500);

    // Rinomina content → body per compatibilità con il frontend
    const posts = (data || []).map(p => ({
      ...p,
      body:      p.content,
      author_id: p.user_id,
    }));
    return corsResponse(posts);
  }

  // ── Le azioni seguenti richiedono autenticazione ────────
  if (!authHeader) return errorResponse('Autenticazione richiesta', 401);

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return errorResponse('Token non valido', 401);

  // Carica il profilo per verificare il piano
  const { data: profile } = await supabase
    .from('profiles')
    .select('nome, cognome, plan, role')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const isPro   = profile?.plan === 'pro' || profile?.plan === 'premium' || isAdmin;
  const authorName = profile
    ? `${profile.nome || ''} ${profile.cognome || ''}`.trim() || user.email?.split('@')[0] || 'Utente'
    : (user.email?.split('@')[0] || 'Utente');

  // ── CREATE ──────────────────────────────────────────────
  if (action === 'create') {
    if (!isPro) return errorResponse('Serve un abbonamento Pro per pubblicare nel forum.', 403);

    const { title, body: content, category } = body;
    if (!title?.trim()) return errorResponse('Il titolo è obbligatorio', 400);
    if (!content?.trim()) return errorResponse('Il testo è obbligatorio', 400);

    const { data: post, error } = await supabase
      .from('forum_posts')
      .insert({
        user_id:     user.id,
        author_name: authorName,
        title:       title.trim(),
        content:     content.trim(),
        category:    category || 'generale',
        status:      'published',
      })
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);
    return corsResponse({ ...post, body: post.content, author_id: post.user_id });
  }

  // ── DELETE ──────────────────────────────────────────────
  if (action === 'delete') {
    const { id } = body;
    if (!id) return errorResponse('ID post mancante', 400);

    // Verifica che l'utente sia l'autore o admin
    const { data: post } = await supabase
      .from('forum_posts')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!post) return errorResponse('Post non trovato', 404);
    if (post.user_id !== user.id && !isAdmin) return errorResponse('Non autorizzato', 403);

    const { error } = await supabase
      .from('forum_posts')
      .update({ status: 'deleted' })
      .eq('id', id);

    if (error) return errorResponse(error.message, 500);
    return corsResponse({ ok: true });
  }

  return errorResponse('Azione non valida', 400);
});
