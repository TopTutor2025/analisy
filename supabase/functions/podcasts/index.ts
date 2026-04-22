// Edge Function: podcasts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  );

  const { data, error } = await supabase
    .from('podcasts')
    .select('id, title, author, duration, embed_url, premium, published_at')
    .order('published_at', { ascending: false });

  if (error) return errorResponse(error.message, 500);
  return corsResponse(data || []);
});
