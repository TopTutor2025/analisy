// =========================================================
//  Edge Function: ai-run
//  Pipeline IA completa: GDELT → Claude → map_events + citycams
// =========================================================
//  Eseguita ogni 6 ore (pg_cron) oppure manualmente dall'admin.
//
//  Segreti necessari:
//    ANTHROPIC_API_KEY         — chiave Claude API
//    SUPABASE_SERVICE_ROLE_KEY — disponibile automaticamente
//
//  Logica categorie:
//    geopolitica  — guerre, operazioni militari, crisi umanitarie,
//                   tensioni tra stati, conflitti armati
//    politica     — elezioni, colpi di stato, crisi di governo,
//                   proteste di massa, politica nazionale
//    business     — sanzioni economiche, guerre commerciali,
//                   crisi energetiche, mercati con impatto geopolitico
//    tecnologia   — cyberattacchi statali, corsa all'IA, guerre sui
//                   semiconduttori, disinformazione, spazio
//
//  Magnitudo (1–4) = gravità dell'evento nel suo dominio:
//    1 = Bassa rilevanza
//    2 = Moderata
//    3 = Alta
//    4 = Critica (breaking, impatto globale immediato)
// =========================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

const GDELT_API = 'https://api.gdeltproject.org/api/v2/doc/doc';

// Query GDELT minimale e veloce
const GDELT_PARAMS = new URLSearchParams({
  query:      '(war OR conflict OR election OR crisis OR military)',
  mode:       'artlist',
  maxrecords: '20',
  sort:       'datedesc',
  format:     'json',
});

// Notizie fallback se GDELT non risponde
const FALLBACK_ARTICLES: GdeltArticle[] = [
  { title: 'Russia-Ukraine war latest developments and frontline updates', url: 'https://www.bbc.com/news/world-europe', domain: 'bbc.com', seendate: new Date().toISOString() },
  { title: 'Middle East conflict Gaza ceasefire negotiations continue', url: 'https://www.reuters.com/world/middle-east', domain: 'reuters.com', seendate: new Date().toISOString() },
  { title: 'US China trade tensions and tariff disputes escalate', url: 'https://www.ft.com/world/us-china', domain: 'ft.com', seendate: new Date().toISOString() },
  { title: 'North Korea missile tests provoke international response', url: 'https://www.reuters.com/world/asia-pacific', domain: 'reuters.com', seendate: new Date().toISOString() },
  { title: 'Iran nuclear program talks stall amid sanctions pressure', url: 'https://www.bbc.com/news/world-middle-east', domain: 'bbc.com', seendate: new Date().toISOString() },
  { title: 'AI regulation battle between US and EU intensifies', url: 'https://www.ft.com/technology', domain: 'ft.com', seendate: new Date().toISOString() },
  { title: 'Taiwan Strait military activity raises regional concerns', url: 'https://www.reuters.com/world/asia-pacific', domain: 'reuters.com', seendate: new Date().toISOString() },
  { title: 'European energy crisis and gas supply disruptions continue', url: 'https://www.ft.com/world/europe', domain: 'ft.com', seendate: new Date().toISOString() },
];

interface GdeltArticle {
  title:    string;
  url:      string;
  domain?:  string;
  seendate: string;
}

interface MapEvent {
  title:           string;
  description:     string;
  lat:             number;
  lng:             number;
  category:        'geopolitica' | 'politica' | 'business' | 'tecnologia';
  magnitude:       1 | 2 | 3 | 4;
  ai_summary:      string;
  ai_brief:        string;
  source_url:      string;
  relevance_score: number;
  expires_at:      string;
}

// ─── Fetch notizie da GDELT (con fallback) ───────────────
async function fetchGdeltArticles(): Promise<GdeltArticle[]> {
  try {
    const res = await fetch(`${GDELT_API}?${GDELT_PARAMS}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`[ai-run] GDELT HTTP ${res.status}, uso fallback`);
      return FALLBACK_ARTICLES;
    }
    const text = await res.text();
    if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
      console.warn(`[ai-run] GDELT risposta non JSON, uso fallback: ${text.slice(0, 80)}`);
      return FALLBACK_ARTICLES;
    }
    const json = JSON.parse(text);
    const articles = json.articles || [];
    if (articles.length === 0) {
      console.warn('[ai-run] GDELT 0 articoli, uso fallback');
      return FALLBACK_ARTICLES;
    }
    console.log(`[ai-run] GDELT OK: ${articles.length} articoli`);
    return articles;
  } catch (err) {
    console.warn(`[ai-run] GDELT timeout/errore, uso fallback: ${err}`);
    return FALLBACK_ARTICLES;
  }
}

// ─── Analisi geopolitica con Claude ──────────────────────
async function analyzeWithClaude(articles: GdeltArticle[]): Promise<MapEvent[]> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY non configurato nelle impostazioni Supabase');
  // Debug: log formato chiave (solo prefisso sicuro)
  console.log(`[ai-run] API key presente: lunghezza=${apiKey.length}, inizio="${apiKey.slice(0, 18)}..."`);
  if (!apiKey.startsWith('sk-ant-')) {
    throw new Error(`ANTHROPIC_API_KEY formato non valido: inizia con "${apiKey.slice(0, 10)}" invece di "sk-ant-"`);
  }

  const headlines = articles
    .slice(0, 25)
    .map((a, i) => `${i + 1}. [${a.domain || 'news'}] ${a.title}  →  ${a.url}`)
    .join('\n');

  const prompt = `Sei un sistema di intelligence geopolitica professionale. Il tuo compito è analizzare notizie globali e identificare gli eventi più rilevanti da rappresentare su una mappa interattiva di geopolitica mondiale.

NOTIZIE IN INGRESSO:
${headlines}

---

ISTRUZIONI:

Identifica i 6–10 eventi più significativi e classificali in uno di questi 4 DOMINI TEMATICI:

• "geopolitica"  → conflitti armati, operazioni militari, crisi umanitarie, tensioni tra stati, invasioni, occupazioni, attentati di rilievo internazionale
• "politica"     → elezioni critiche, colpi di stato, crisi di governo, proteste di massa, cambi di regime, politica nazionale con impatto internazionale
• "business"     → sanzioni economiche, guerre commerciali, dazi, crisi energetiche, default sovrani, mercati con impatto geopolitico diretto
• "tecnologia"   → cyberattacchi statali, corsa all'IA militare, guerre sui semiconduttori, sorveglianza di massa, disinformazione coordinata, space race

La MAGNITUDO (1–4) misura la gravità dell'evento NEL SUO DOMINIO:
• 1 = Bassa rilevanza (sviluppo minore, aggiornamento di routine)
• 2 = Moderata (sviluppo degno di nota, monitorare)
• 3 = Alta (evento significativo, impatto regionale/internazionale)
• 4 = Critica (breaking news, impatto globale immediato, potenziale escalation)

IMPORTANTE:
- Non usare le vecchie categorie (conflict, tension, crisis, political, economic). Usa SOLO: geopolitica, politica, business, tecnologia.
- Un conflitto armato in corso È geopolitica con magnitudo 3 o 4, non una categoria a sé.
- Un'elezione importante È politica, non geopolitica.
- La magnitudo descrive quanto è GRAVE l'evento, non il dominio.
- Scrivi title, description, ai_summary e ai_brief in ITALIANO.
- expires_at: eventi magnitudo 4 scadono dopo 30 giorni, magnitudo 3 dopo 21 giorni, ≤2 dopo 14 giorni.

Rispondi SOLO con un array JSON valido, senza markdown, senza testo aggiuntivo. Struttura di ogni oggetto:
{
  "title": "stringa max 65 caratteri",
  "description": "stringa max 130 caratteri",
  "lat": numero,
  "lng": numero,
  "category": "geopolitica|politica|business|tecnologia",
  "magnitude": 1|2|3|4,
  "ai_summary": "riassunto analitico max 220 caratteri",
  "ai_brief": "analisi approfondita 150–250 parole in italiano, contesto storico incluso",
  "source_url": "url fonte principale",
  "relevance_score": numero 0-100,
  "expires_at": "data ISO 8601"
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
      max_tokens: 8000,
      messages:   [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`[ai-run] Claude errore completo: ${err}`);
    throw new Error(`Claude API ${response.status}: ${err.slice(0, 500)}`);
  }

  const claude = await response.json();
  const rawText = claude.content?.[0]?.text || '';
  console.log(`[ai-run] Claude risposta: ${rawText.length} caratteri, stop_reason=${claude.stop_reason}`);

  // Estrai JSON array — gestisce markdown, testo prima/dopo
  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error(`[ai-run] Nessun array JSON trovato. Inizio risposta: ${rawText.slice(0, 300)}`);
    throw new Error('Claude non ha restituito JSON valido');
  }

  let events: MapEvent[] = [];
  try {
    events = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    console.error(`[ai-run] JSON.parse fallito: ${parseErr}. Testo: ${jsonMatch[0].slice(0, 200)}`);
    throw new Error(`JSON parse error: ${parseErr}`);
  }
  return events.filter(e =>
    e.title && typeof e.lat === 'number' && typeof e.lng === 'number' &&
    ['geopolitica','politica','business','tecnologia'].includes(e.category) &&
    e.magnitude >= 1 && e.magnitude <= 4
  );
}

// ─── Aggiorna citycams in base agli eventi attivi ─────────
async function updateCitycams(
  adminClient: ReturnType<typeof createClient>,
  events: MapEvent[]
) {
  // Filtra solo eventi con alta rilevanza (magnitudo ≥ 3)
  const highPriority = events
    .filter(e => e.magnitude >= 3)
    .sort((a, b) => b.magnitude - a.magnitude || b.relevance_score - a.relevance_score)
    .slice(0, 8);

  for (const ev of highPriority) {
    // Cerca citycam vicine (±5 gradi) che NON abbiano il blocco manuale attivo
    const { data: nearby } = await adminClient
      .from('citycams')
      .select('id, ai_lock')
      .gte('lat', ev.lat - 5).lte('lat', ev.lat + 5)
      .gte('lng', ev.lng - 5).lte('lng', ev.lng + 5)
      .eq('ai_lock', false)   // ← salta le cam con override manuale
      .eq('active', true)
      .limit(1);

    if (nearby && nearby.length > 0) {
      await adminClient.from('citycams').update({
        ai_priority:       ev.relevance_score,
        ai_event_title:    ev.title,
        ai_event_category: ev.category,
        updated_at:        new Date().toISOString(),
      }).eq('id', nearby[0].id);
    }
  }
}

// ─── Handler principale ───────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Verifica autorizzazione (admin loggato oppure service role interno)
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
        .from('profiles').select('role').eq('id', user.id).single();
      if (!profile || profile.role !== 'admin') {
        return errorResponse('Solo gli admin possono avviare la pipeline IA', 403);
      }
    }
  }

  // Crea il job di log
  const { data: job, error: jobError } = await adminClient
    .from('ai_jobs')
    .insert({ status: 'running' })
    .select().single();
  if (jobError) return errorResponse(jobError.message, 500);
  const jobId = job.id;

  // Pipeline in background (risponde subito, elabora dopo)
  (async () => {
    let articlesProcessed = 0, eventsCreated = 0, eventsRenewed = 0, eventsResolved = 0;
    try {
      // 1. Recupera notizie globali
      const gdeltArticles = await fetchGdeltArticles();
      articlesProcessed   = gdeltArticles.length;

      // 2. Analisi con Claude → eventi strutturati
      const newEvents = await analyzeWithClaude(gdeltArticles);

      // 3. Carica eventi attivi non bloccati manualmente
      const { data: existing } = await adminClient
        .from('map_events')
        .select('id, title, lat, lng, category')
        .eq('status', 'active')
        .eq('manual_lock', false);

      const existingMap = new Map(
        (existing || []).map(e => [e.title.toLowerCase().slice(0, 35), e])
      );

      // 4. Inserisci / aggiorna eventi
      for (const ev of newEvents) {
        const key = ev.title.toLowerCase().slice(0, 35);
        if (existingMap.has(key)) {
          const match = existingMap.get(key)!;
          await adminClient.from('map_events').update({
            magnitude:       ev.magnitude,
            ai_summary:      ev.ai_summary,
            ai_brief:        ev.ai_brief,
            relevance_score: ev.relevance_score,
            expires_at:      ev.expires_at,
            source_url:      ev.source_url,
          }).eq('id', match.id);
          eventsRenewed++;
        } else {
          await adminClient.from('map_events').insert({
            title:           ev.title,
            description:     ev.description,
            lat:             ev.lat,
            lng:             ev.lng,
            category:        ev.category,
            magnitude:       ev.magnitude,
            status:          'active',
            ai_summary:      ev.ai_summary,
            ai_brief:        ev.ai_brief,
            source_url:      ev.source_url,
            relevance_score: ev.relevance_score,
            expires_at:      ev.expires_at,
          });
          eventsCreated++;
        }
      }

      // 5. Archivia eventi scaduti
      const { data: expired } = await adminClient
        .from('map_events')
        .update({ status: 'expired' })
        .lt('expires_at', new Date().toISOString())
        .eq('status', 'active')
        .eq('manual_lock', false)
        .select('id');
      eventsResolved = (expired || []).length;

      // 6. Aggiorna citycams in base ai nuovi eventi
      await updateCitycams(adminClient, newEvents);

      // 7. Segna job completato
      await adminClient.from('ai_jobs').update({
        status:             'completed',
        finished_at:        new Date().toISOString(),
        articles_processed: articlesProcessed,
        events_created:     eventsCreated,
        events_renewed:     eventsRenewed,
        events_resolved:    eventsResolved,
      }).eq('id', jobId);

    } catch (err) {
      console.error('[ai-run]', err);
      await adminClient.from('ai_jobs').update({
        status:        'failed',
        finished_at:   new Date().toISOString(),
        error_message: String(err),
      }).eq('id', jobId);
    }
  })();

  return corsResponse({
    ok:      true,
    jobId,
    message: 'Pipeline IA avviata. Gli eventi saranno visibili sulla mappa tra circa 60 secondi.',
  });
});
