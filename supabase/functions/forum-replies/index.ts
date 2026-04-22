// =========================================================
//  Edge Function: forum-replies
//  actions: list | create | delete
// =========================================================
//  list   → risposte di un post, richiede auth
//  create → richiede plan pro o admin (come i post)
//  delete → richiede essere l'autore oppure admin
// =========================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const body   = await req.json().catch(() => ({}));
  const action = body.action || 'list';

  const authHeader = req.headers.get('Authorization');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    authHeader ? { global: { headers: { Authorization: authHeader } } } : {}
  );

  // ── LIST ────────────────────────────────────────────────
  if (action === 'list') {
    const { postId } = body;
    if (!postId) return errorResponse('postId mancante', 400);

    const { data, error } = await supabase
      .from('forum_replies')
      .select('id, post_id, user_id, author_name, body, created_at')
      .eq('post_id', postId)
      .eq('status', 'published')
      .order('created_at', { ascending: true });

    if (error) return errorResponse(error.message, 500);

    const replies = (data || []).map(r => ({
      ...r,
      author_id: r.user_id,
    }));
    return corsResponse(replies);
  }

  // ── Le azioni seguenti richiedono autenticazione ────────
  if (!authHeader) return errorResponse('Autenticazione richiesta', 401);

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return errorResponse('Token non valido', 401);

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
    if (!isPro) return errorResponse('Serve un abbonamento Pro per rispondere nel forum.', 403);

    const { postId, body: replyBody } = body;
    if (!postId)           return errorResponse('postId mancante', 400);
    if (!replyBody?.trim()) return errorResponse('Il testo è obbligatorio', 400);

    // Verifica che il post esista
    const { data: post } = await supabase
      .from('forum_posts')
      .select('id')
      .eq('id', postId)
      .eq('status', 'published')
      .single();

    if (!post) return errorResponse('Post non trovato', 404);

    const { data: reply, error } = await supabase
      .from('forum_replies')
      .insert({
        post_id:     postId,
        user_id:     user.id,
        author_name: authorName,
        body:        replyBody.trim(),
        status:      'published',
      })
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);
    return corsResponse({ ...reply, author_id: reply.user_id });
  }

  // ── DELETE ──────────────────────────────────────────────
  if (action === 'delete') {
    const { id } = body;
    if (!id) return errorResponse('ID risposta mancante', 400);

    const { data: reply } = await supabase
      .from('forum_replies')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!reply) return errorResponse('Risposta non trovata', 404);
    if (reply.user_id !== user.id && !isAdmin) return errorResponse('Non autorizzato', 403);

    const { error } = await supabase
      .from('forum_replies')
      .update({ status: 'deleted' })
      .eq('id', id);

    if (error) return errorResponse(error.message, 500);
    return corsResponse({ ok: true });
  }

  return errorResponse('Azione non valida', 400);
});
