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
  const prompt = `Sei un giornalista e analista geopolitico di alto livello che scrive per una testata di intelligence italiana.

Scrivi un articolo professionale e approfondito basato su questo evento:

TITOLO EVENTO: ${ev.title}
CATEGORIA: ${CATEGORY_LABELS[ev.category] || ev.category}
MAGNITUDO: ${ev.magnitude}/4
DESCRIZIONE: ${ev.description}
BRIEF ANALITICO: ${ev.ai_brief || ev.ai_summary}
FONTE: ${ev.source_url}

L'articolo deve:
- Essere scritto in italiano, tono professionale e autorevole
- Avere un TITOLO giornalistico efficace (max 90 caratteri)
- Avere un SOTTOTITOLO che aggiunge contesto (max 150 caratteri)
- Avere un CONTENUTO di 500–800 parole in formato HTML semplice (<p>, <h3>, <strong>)
  - Paragrafo 1: contesto e fatto principale
  - Paragrafo 2: background storico e cause
  - Paragrafo 3: impatti e scenari possibili
  - Paragrafo 4: implicazioni per l'Europa / Italia (se rilevante)
- Avere un EXCERPT (estratto) di max 180 caratteri
- Avere un READ_TIME stimato (es. "5 min")

Rispondi SOLO con JSON valido:
{
  "title": "...",
  "subtitle": "...",
  "content": "<p>...</p>",
  "excerpt": "...",
  "read_time": "X min",
  "author": "Redazione Analisy"
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-3-haiku-20240307',   // più veloce per articoli frequenti
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

  // Carica titoli articoli esistenti per evitare duplicati (ultimi 2 giorni)
  const since = new Date(Date.now() - 48 * 3600000).toISOString();
  const { data: recentArticles } = await adminClient
    .from('articles')
    .select('title')
    .gte('created_at', since);

  const recentTitles = new Set(
    (recentArticles || []).map(a => a.title.toLowerCase().slice(0, 40))
  );

  let created = 0;
  let skipped = 0;
  const results: string[] = [];

  // Elabora al massimo 5 eventi per esecuzione (evita timeout)
  for (const ev of (events as MapEvent[]).slice(0, 5)) {
    const key = ev.title.toLowerCase().slice(0, 40);
    if (recentTitles.has(key)) { skipped++; continue; }

    try {
      const article = await generateArticle(ev, apiKey);
      const isPremium = ev.magnitude >= 3; // articoli su eventi critici sono premium

      await adminClient.from('articles').insert({
        title:        article.title,
        subtitle:     article.subtitle || '',
        content:      article.content  || '',
        excerpt:      article.excerpt  || '',
        read_time:    article.read_time || '5 min',
        author:       article.author || 'Redazione Analisy',
        cat:          ev.category,
        cat_label:    CATEGORY_LABELS[ev.category] || ev.category,
        premium:      isPremium,
        status:       'published',
        published_at: new Date().toISOString(),
        image:        '',  // nessuna immagine di default per articoli IA
      });

      recentTitles.add(key);
      created++;
      results.push(article.title);
    } catch (err) {
      console.error('[ai-articles] Errore per evento', ev.id, err);
    }
  }

  return corsResponse({
    ok:      true,
    created,
    skipped,
    articles: results,
  });
});
