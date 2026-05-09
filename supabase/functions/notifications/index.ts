// =========================================================
//  Edge Function: notifications
//  Lettura pubblica delle notifiche attive (non scadute)
// =========================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  );

  const now = new Date().toISOString();

  const { data, error } = await db
    .from('notifications')
    .select('id, title, body, type, created_at, expires_at')
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message, 500);
  return corsResponse(data || []);
});
