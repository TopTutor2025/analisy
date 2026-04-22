// Edge Function: articles
// Ritorna gli articoli. Se filter=all richiede role=admin.
// Gli articoli premium sono accessibili solo a utenti premium/pro.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const body   = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const filter = body.filter || 'published';

  // Client anonimo per dati pubblici
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  );

  // Determina il piano dell'utente (se loggato)
  let userPlan = 'free';
  let userRole = 'user';
  const authHeader = req.headers.get('Authorization');
  if (authHeader) {
    const authedClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await authedClient.auth.getUser();
    if (user) {
      const { data: profile } = await authedClient
        .from('profiles')
        .select('plan, role')
        .eq('id', user.id)
        .single();
      if (profile) {
        userPlan = profile.plan;
        userRole = profile.role;
      }
    }
  }

  if (filter === 'all' && userRole !== 'admin') {
    return errorResponse('Accesso non autorizzato', 403);
  }

  let query = supabase
    .from('articles')
    .select('id, title, subtitle, cat, cat_label, author, read_time, image, excerpt, premium, status, published_at')
    .order('published_at', { ascending: false });

  if (filter !== 'all') {
    query = query.eq('status', 'published');
  }

  const { data: articles, error } = await query;
  if (error) return errorResponse(error.message, 500);

  // Marca gli articoli premium come bloccati se l'utente non ha accesso
  const isPremium = userPlan === 'premium' || userPlan === 'pro' || userRole === 'admin';
  const result = (articles || []).map(a => ({
    ...a,
    locked: a.premium && !isPremium,
  }));

  return corsResponse(result);
});
