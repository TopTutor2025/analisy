// Edge Function: citycams
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  );

  const { data, error } = await supabase
    .from('citycams')
    .select('id, flag, name, embed_url, lat, lng, ai_priority, ai_event_title, ai_event_category')
    .eq('active', true)
    .order('ai_priority', { ascending: false });

  if (error) return errorResponse(error.message, 500);
  return corsResponse(data || []);
});
