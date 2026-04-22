// Edge Function: admin-users
// Ritorna la lista di tutti gli utenti. Solo admin.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Non autenticato', 401);

  // Verifica che l'utente sia admin
  const authedClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await authedClient.auth.getUser();
  if (!user) return errorResponse('Non autenticato', 401);

  const { data: profile } = await authedClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') return errorResponse('Accesso negato', 403);

  // Usa il service role per leggere tutti gli utenti
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: profiles, error } = await adminClient
    .from('profiles')
    .select('id, email, nome, cognome, role, plan, sub_status, created_at')
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message, 500);
  return corsResponse(profiles || []);
});
