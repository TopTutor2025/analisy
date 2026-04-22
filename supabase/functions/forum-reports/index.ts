// =========================================================
//  Edge Function: forum-reports
//  Riceve segnalazioni di contenuti dal forum.
//  Richiede autenticazione — chiunque loggato può segnalare.
// =========================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Autenticazione richiesta', 401);

  const body = await req.json().catch(() => ({}));
  const { contentType, contentId, authorId, authorName, contentText, reason } = body;

  if (!contentType || !contentId || !reason?.trim()) {
    return errorResponse('Campi obbligatori mancanti (contentType, contentId, reason)', 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return errorResponse('Token non valido', 401);

  const { error } = await supabase
    .from('forum_reports')
    .insert({
      reporter_id:  user.id,
      content_type: contentType,
      content_id:   String(contentId),
      author_id:    authorId  || '',
      author_name:  authorName || '',
      content_text: contentText || '',
      reason:       reason.trim(),
      status:       'pending',
    });

  if (error) return errorResponse(error.message, 500);
  return corsResponse({ ok: true });
});
