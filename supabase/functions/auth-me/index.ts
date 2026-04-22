// Edge Function: auth-me
// Ritorna il profilo completo dell'utente loggato (profilo + piano)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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

  // Verifica il token e ottieni l'utente
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return errorResponse('Token non valido', 401);

  // Carica il profilo dalla tabella profiles
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) return errorResponse('Profilo non trovato', 404);

  return corsResponse({
    id:         profile.id,
    email:      profile.email || user.email,
    nome:       profile.nome,
    cognome:    profile.cognome,
    role:       profile.role,
    plan:       profile.plan,
    sub_status: profile.sub_status,
  });
});
