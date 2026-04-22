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

  // Client autenticato — solo per verificare il ruolo
  const authedClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authErr } = await authedClient.auth.getUser();
  if (authErr || !user) return errorResponse('Token non valido', 401);

  const { data: profile } = await authedClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') return errorResponse('Accesso riservato agli admin', 403);

  // Service role per la scrittura (bypassa RLS)
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const body = await req.json().catch(() => ({}));

  // Accetta sia { cam: {...} } che payload flat
  const cam  = (body.cam && typeof body.cam === 'object') ? body.cam : body;
  const name = (cam.name || '').trim();
  if (!name) return errorResponse('Il nome è obbligatorio', 400);

  // Genera UUID per le cam nuove
  const id = cam.id || crypto.randomUUID();

  const { error } = await adminClient
    .from('citycams')
    .upsert({
      id,
      name,
      flag:               cam.flag              || '',
      embed_url:          cam.embed_url || cam.embedUrl || '',
      lat:                cam.lat               ?? null,
      lng:                cam.lng               ?? null,
      ai_priority:        cam.ai_priority       ?? cam.aiPriority       ?? 50,
      ai_event_title:     cam.ai_event_title    || cam.aiEventTitle     || '',
      ai_event_category:  cam.ai_event_category || cam.aiEventCategory  || '',
      ai_lock:            cam.ai_lock           ?? cam.aiLock           ?? false,
      active:             cam.active            ?? true,
    }, { onConflict: 'id' });

  if (error) return errorResponse(error.message, 500);
  return corsResponse({ ok: true, id });
});
