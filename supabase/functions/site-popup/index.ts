// =========================================================
//  Edge Function: site-popup
//  Ritorna il popup attivo (se esiste) — endpoint pubblico
// =========================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  );

  const { data, error } = await db
    .from('site_popups')
    .select('id, title, body, cta_text, cta_url, show_on, delay_sec')
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  if (error) return errorResponse(error.message, 500);
  return corsResponse(data || null);
});
