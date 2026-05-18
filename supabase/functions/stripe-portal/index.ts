// =========================================================
//  Edge Function: stripe-portal
//  Crea una Stripe Customer Portal Session (gestione/cancellazione).
// =========================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Non autenticato', 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse('Non autenticato', 401);

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const { data: profile } = await db
    .from('profiles')
    .select('stripe_customer')
    .eq('id', user.id)
    .single();

  if (!profile?.stripe_customer) {
    return errorResponse('Nessun account Stripe trovato', 404);
  }

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
  const siteUrl = Deno.env.get('SITE_URL') || 'https://analisy.report';

  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   profile.stripe_customer,
    return_url: `${siteUrl}/dashboard.html`,
  });

  return corsResponse({ url: portalSession.url });
});
