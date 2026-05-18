// =========================================================
//  Edge Function: site-goal  (pubblica, no auth)
//  Restituisce l'obiettivo abbonamenti attivo + conteggio
//  corrente degli abbonati attivi.
// =========================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Obiettivo attivo
  const { data: goal } = await db
    .from('subscription_goals')
    .select('id, target_count, label, show_in_popup')
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  if (!goal) return corsResponse(null);

  // Conteggio abbonati attivi (plan != 'free' AND sub_status = 'active')
  const { count } = await db
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('sub_status', 'active')
    .neq('plan', 'free');

  return corsResponse({ ...goal, current_count: count ?? 0 });
});
