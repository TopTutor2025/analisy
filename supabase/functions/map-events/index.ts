// Edge Function: map-events
// Ritorna tutti gli eventi attivi sulla mappa (generati dall'IA).
// Endpoint pubblico — non richiede autenticazione.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  );

  const { data: events, error } = await supabase
    .from('map_events')
    .select('id, title, description, lat, lng, category, magnitude, ai_summary, ai_brief, source_url, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message, 500);

  // Rinomina description → desc per compatibilità con map.js
  const result = (events || []).map(e => ({
    id:        e.id,
    title:     e.title,
    desc:      e.description,
    lat:       e.lat,
    lng:       e.lng,
    category:  e.category,
    magnitude: e.magnitude,
    summary:   e.ai_summary,
    brief:     e.ai_brief,
    sourceUrl: e.source_url,
    createdAt: e.created_at,
  }));

  return corsResponse(result);
});
