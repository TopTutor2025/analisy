// =========================================================
//  Edge Function: stripe-checkout
//  Crea una Stripe Checkout Session e restituisce l'URL.
//  Richiede autenticazione utente.
// =========================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Non autenticato', 401);

  // Verifica utente
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse('Non autenticato', 401);

  const { plan } = await req.json().catch(() => ({}));
  if (!plan || !['premium', 'pro'].includes(plan)) {
    return errorResponse('Piano non valido', 400);
  }

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });

  // Price ID dal piano scelto
  const priceId = plan === 'premium'
    ? Deno.env.get('STRIPE_PRICE_PREMIUM')!
    : Deno.env.get('STRIPE_PRICE_PRO')!;

  const siteUrl = Deno.env.get('SITE_URL') || 'https://analisy.report';

  // Recupera o crea customer Stripe
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const { data: profile } = await db
    .from('profiles')
    .select('stripe_customer, email')
    .eq('id', user.id)
    .single();

  let customerId = profile?.stripe_customer;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile?.email || user.email,
      metadata: { supabase_id: user.id }
    });
    customerId = customer.id;
    await db.from('profiles').update({ stripe_customer: customerId }).eq('id', user.id);
  }

  const session = await stripe.checkout.sessions.create({
    customer:           customerId,
    payment_method_types: ['card'],
    line_items:         [{ price: priceId, quantity: 1 }],
    mode:               'subscription',
    success_url:        `${siteUrl}/dashboard.html?payment=success&plan=${plan}`,
    cancel_url:         `${siteUrl}/dashboard.html?payment=cancelled`,
    client_reference_id: user.id,
    metadata:           { supabase_id: user.id, plan },
    subscription_data:  { metadata: { supabase_id: user.id, plan } },
  });

  return corsResponse({ url: session.url });
});
