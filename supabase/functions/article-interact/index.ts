// Edge Function: article-interact
// Tracking pubblico (no auth) di visualizzazioni e like sugli articoli.
// actions: view | like | unlike
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const { action, id } = body;

  if (!id) return errorResponse('id articolo mancante', 400);

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  if (action === 'view') {
    await db.rpc('increment_article_views', { article_id: String(id) });
    return corsResponse({ ok: true });
  }

  if (action === 'like') {
    const { data } = await db.rpc('increment_article_likes', { article_id: String(id) });
    return corsResponse({ ok: true, likes: data ?? 0 });
  }

  if (action === 'unlike') {
    const { data } = await db.rpc('decrement_article_likes', { article_id: String(id) });
    return corsResponse({ ok: true, likes: data ?? 0 });
  }

  return errorResponse('Azione non valida', 400);
});
