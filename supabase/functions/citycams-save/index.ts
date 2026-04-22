// =========================================================
//  Edge Function: citycams-save
//  Salva una citycam (insert o update) — solo admin
// =========================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Autenticazione richiesta', 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  // Verifica admin
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return errorResponse('Token non valido', 401);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') return errorResponse('Accesso riservato agli admin', 403);

  const body = await req.json().catch(() => ({}));
  const { cam } = body;

  if (!cam?.id || !cam?.name) return errorResponse('Dati cam mancanti (id, name)', 400);

  // Upsert: aggiorna se esiste, inserisce se non esiste
  const { error } = await supabase
    .from('citycams')
    .upsert({
      id:               cam.id,
      name:             cam.name,
      flag:             cam.flag             || '',
      embed_url:        cam.embed_url        || '',
      lat:              cam.lat              ?? null,
      lng:              cam.lng              ?? null,
      ai_priority:      cam.ai_priority      ?? 50,
      ai_event_title:   cam.ai_event_title   || '',
      ai_event_category:cam.ai_event_category|| '',
      ai_lock:          cam.ai_lock          ?? false,
      active:           cam.active           ?? true,
    }, { onConflict: 'id' });

  if (error) return errorResponse(error.message, 500);
  return corsResponse({ ok: true });
});
