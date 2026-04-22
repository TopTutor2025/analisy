// =========================================================
//  Edge Function: ai-articles
//  Genera e aggiorna articoli IA basati sugli eventi attivi
// =========================================================
//  Eseguita ogni 30 minuti (pg_cron) o manualmente.
//  Logica:
//    1. Legge gli eventi attivi con magnitudo ≥ 2
//    2. Per gli eventi senza articolo o con articolo > 30 min:
//       chiede a Claude di scrivere un articolo giornalistico
//    3. Salva in tabella articles con status='published'
//
//  Segreti necessari:
//    ANTHROPIC_API_KEY
//    SUPABASE_SERVICE_ROLE_KEY
// =========================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

const CATEGORY_LABELS: Record<string, string> = {
  geopolitica: 'Geopolitica',
  politica:    'Politica',
  business:    'Business',
  tecnologia:  'Tecnologia',
};

interface MapEvent {
  id:          string;
  title:       string;
  description: string;
  category:    string;
  magnitude:   number;
  ai_summary:  string;
  ai_brief:    string;
  source_url:  string;
}

// ─── Genera articolo per un evento ───────────────────────
async function generateArticle(ev: MapEvent, apiKey: string) {
  const prompt = `Sei un analista di intelligence geopolitica. Scrivi un FLASH UPDATE in italiano su questo evento da mostrare in tempo reale su una piattaforma di analisi geopolitica.

EVENTO: ${ev.title}
CATEGORIA: ${CATEGORY_LABELS[ev.category] || ev.category}
CONTESTO: ${ev.description}
ANALISI: ${ev.ai_brief || ev.ai_summary}

Il flash update deve:
- Titolo giornalistico incisivo (max 85 caratteri)
- Sottotitolo che sintetizza il punto chiave (max 140 caratteri)
- Testo principale: ESATTAMENTE 12-15 frasi in italiano, tono autorevole da intelligence briefing. Struttura: 3 frasi sul fatto attuale → 3 frasi sul contesto storico → 3 frasi sugli attori coinvolti → 3 frasi sugli scenari possibili e impatti. NO immagini, NO titoletti interni, solo testo continuo fluente.
- Excerpt: 1 frase di 160-180 caratteri che cattura l'essenza
- Read time: "4 min"

Rispondi SOLO con JSON valido, nessun testo fuori dal JSON:
{
  "title": "...",
  "subtitle": "...",
  "content": "testo delle 12-15 frasi senza tag HTML",
  "excerpt": "...",
  "read_time": "4 min",
  "author": "AI Intelligence · Analisy"
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5',
      max_tokens: 2500,
      messages:   [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) throw new Error(`Claude ${response.status}`);
  const data = await response.json();
  const text = data.content?.[0]?.text || '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('JSON non valido da Claude');
  return JSON.parse(jsonMatch[0]);
}

// ─── Handler ──────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return errorResponse('ANTHROPIC_API_KEY non configurato', 500);

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Verifica autorizzazione
  const authHeader = req.headers.get('Authorization');
  if (authHeader) {
    const authedClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await authedClient.auth.getUser();
    if (user) {
      const { data: p } = await authedClient
        .from('profiles').select('role').eq('id', user.id).single();
      if (!p || p.role !== 'admin') return errorResponse('Accesso negato', 403);
    }
  }

  // Carica eventi attivi con magnitudo ≥ 2
  const { data: events, error: evError } = await adminClient
    .from('map_events')
    .select('id, title, description, category, magnitude, ai_summary, ai_brief, source_url')
    .eq('status', 'active')
    .gte('magnitude', 2)
    .order('magnitude', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10);

  if (evError) return errorResponse(evError.message, 500);
  if (!events || events.length === 0) return corsResponse({ ok: true, message: 'Nessun evento attivo da elaborare.' });

  // Carica tutti gli scenari AI esistenti (per aggiornare invece di duplicare)
  const { data: existingAI } = await adminClient
    .from('articles')
    .select('id, title')
    .eq('author', 'AI Intelligence · Analisy');

  // Mappa: chiave titolo → id articolo esistente
  const existingMap = new Map(
    (existingAI || []).map(a => [a.title.toLowerCase().slice(0, 40), a.id])
  );

  let created = 0;
  let updated = 0;
  const results: string[] = [];

  // Elabora al massimo 5 eventi per esecuzione (evita timeout)
  for (const ev of (events as MapEvent[]).slice(0, 5)) {
    try {
      const article = await generateArticle(ev, apiKey);
      const AI_AUTHOR = 'AI Intelligence · Analisy';

      // Cerca se esiste già uno scenario per questo evento (per titolo)
      const evKey  = ev.title.toLowerCase().slice(0, 40);
      const artKey = article.title.toLowerCase().slice(0, 40);
      const existingId = existingMap.get(evKey) || existingMap.get(artKey);

      const payload = {
        title:        article.title,
        subtitle:     article.subtitle || '',
        content:      article.content  || '',
        excerpt:      article.excerpt  || '',
        read_time:    article.read_time || '4 min',
        author:       AI_AUTHOR,
        cat:          ev.category,
        cat_label:    CATEGORY_LABELS[ev.category] || ev.category,
        premium:      false,   // scenari AI sempre pubblici
        status:       'published',
        published_at: new Date().toISOString(),
        image:        '',
      };

      if (existingId) {
        // AGGIORNA lo scenario esistente
        await adminClient.from('articles').update(payload).eq('id', existingId);
        updated++;
      } else {
        // CREA nuovo scenario
        const { data: inserted } = await adminClient.from('articles').insert(payload).select('id, title').single();
        if (inserted) existingMap.set(artKey, inserted.id);
        created++;
      }
      results.push(article.title);
    } catch (err) {
      console.error('[ai-articles] Errore per evento', ev.id, err);
    }
  }

  return corsResponse({
    ok:      true,
    created,
    updated,
    articles: results,
  });
});
