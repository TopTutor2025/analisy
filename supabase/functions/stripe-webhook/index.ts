// =========================================================
//  Edge Function: stripe-webhook
//  Riceve eventi Stripe e aggiorna profilo + storico abbonamenti.
//  NON richiede autenticazione — verificata tramite Stripe signature.
// =========================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { corsHeaders } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('No signature', { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    );
  } catch (err) {
    console.error('Webhook signature error:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // ── Pagamento completato (prima sottoscrizione o rinnovo) ──
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.CheckoutSession;
    const userId  = session.client_reference_id || session.metadata?.supabase_id;
    const plan    = session.metadata?.plan || 'premium';
    if (!userId) return new Response('No user ID', { status: 400 });

    const now   = new Date();
    const end   = new Date(now); end.setMonth(end.getMonth() + 1);

    await db.from('profiles').update({
      plan,
      sub_status:         'active',
      subscription_start: now.toISOString(),
      subscription_end:   end.toISOString(),
    }).eq('id', userId);

    await db.from('subscription_history').insert({
      user_id:            userId,
      plan,
      sub_status:         'active',
      subscription_start: now.toISOString(),
      subscription_end:   end.toISOString(),
    });
  }

  // ── Rinnovo automatico (invoice pagata) ──
  if (event.type === 'invoice.payment_succeeded') {
    const invoice      = event.data.object as Stripe.Invoice;
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
    const userId       = subscription.metadata?.supabase_id;
    const plan         = subscription.metadata?.plan || 'premium';
    if (!userId) return new Response('OK', { status: 200 });

    const periodEnd = new Date((subscription as any).current_period_end * 1000);
    const periodStart = new Date((subscription as any).current_period_start * 1000);

    await db.from('profiles').update({
      plan,
      sub_status:         'active',
      subscription_start: periodStart.toISOString(),
      subscription_end:   periodEnd.toISOString(),
    }).eq('id', userId);

    await db.from('subscription_history').insert({
      user_id:            userId,
      plan,
      sub_status:         'active',
      subscription_start: periodStart.toISOString(),
      subscription_end:   periodEnd.toISOString(),
    });
  }

  // ── Pagamento fallito ──
  if (event.type === 'invoice.payment_failed') {
    const invoice      = event.data.object as Stripe.Invoice;
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
    const userId       = subscription.metadata?.supabase_id;
    if (userId) {
      await db.from('profiles').update({ sub_status: 'inactive' }).eq('id', userId);
    }
  }

  // ── Abbonamento cancellato/scaduto ──
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;
    const userId       = subscription.metadata?.supabase_id;
    if (userId) {
      await db.from('profiles').update({
        sub_status: 'expired',
        plan:       'free',
      }).eq('id', userId);
    }
  }

  return new Response('OK', { status: 200 });
});
