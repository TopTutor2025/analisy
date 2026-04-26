// =========================================================
//  Edge Function: ai-run
//  Pipeline IA completa: RSS feeds → Claude → map_events + citycams
// =========================================================
//  Eseguita ogni 6 ore (pg_cron) oppure manualmente dall'admin.
//
//  Sorgenti notizie (in ordine di priorità):
//    1. BBC World News RSS
//    2. Reuters World RSS
//    3. Al Jazeera RSS
//    4. NYT World RSS
//    5. The Guardian World RSS
//  (nessuna API key necessaria — feed pubblici)
//
//  Segreti necessari:
//    ANTHROPIC_API_KEY         — chiave Claude API
//    SUPABASE_SERVICE_ROLE_KEY — disponibile automaticamente
// =========================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, corsResponse, errorResponse } from '../_shared/cors.ts';

// ─── Feed RSS pubblici (nessuna API key) ─────────────────
const RSS_FEEDS = [
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml',             source: 'BBC World'     },
  { url: 'https://feeds.reuters.com/reuters/worldNews',             source: 'Reuters'       },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml',              source: 'Al Jazeera'    },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', source: 'NYT World'     },
  { url: 'https://www.theguardian.com/world/rss',                  source: 'The Guardian'  },
];

interface NewsArticle {
  title:    string;
  url:      string;
  source:   string;
  pubDate:  string;
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

// ─── Parse RSS/Atom XML senza librerie esterne ───────────
function parseRssItems(xml: string, source: string): NewsArticle[] {
  const items: NewsArticle[] = [];

  // Supporta sia RSS <item> che Atom <entry>
  const itemRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    // Titolo: gestisce CDATA e testo puro
    const titleMatch =
      block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
      block.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const title = titleMatch?.[1]?.replace(/<[^>]+>/g, '').trim();

    // URL: <link>, <link href="...">, <guid>
    const linkMatch =
      block.match(/<link[^>]+href="([^"]+)"/) ||
      block.match(/<link>(https?:\/\/[^<]+)<\/link>/) ||
      block.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/);
    const url = linkMatch?.[1]?.trim();

    // Data
    const dateMatch =
      block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) ||
      block.match(/<published>([\s\S]*?)<\/published>/) ||
      block.match(/<updated>([\s\S]*?)<\/updated>/);
    const pubDate = dateMatch?.[1]?.trim() || new Date().toUTCString();

    if (title && url && title.length > 10) {
      items.push({ title, url, source, pubDate });
    }
  }

  return items;
}

// ─── Fetch notizie da tutti i feed RSS ───────────────────
async function fetchNewsFromRss(): Promise<NewsArticle[]> {
  const allArticles: NewsArticle[] = [];
  const errors: string[] = [];

  const fetchPromises = RSS_FEEDS.map(async ({ url, source }) => {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': 'Analisy/1.0 news aggregator' },
      });
      if (!res.ok) {
        errors.push(`${source}: HTTP ${res.status}`);
        return;
      }
      const xml = await res.text();
      const items = parseRssItems(xml, source);
      console.log(`[ai-run] ${source}: ${items.length} articoli`);
      allArticles.push(...items);
    } catch (err) {
      errors.push(`${source}: ${err}`);
      console.warn(`[ai-run] Feed ${source} fallito: ${err}`);
    }
  });

  // Fetch parallelo con timeout globale 20s
  await Promise.allSettled(fetchPromises);

  if (errors.length > 0) {
    console.warn(`[ai-run] Feed con errori: ${errors.join(' | ')}`);
  }

  if (allArticles.length === 0) {
    console.error('[ai-run] Nessun feed RSS disponibile — pipeline interrotta');
    throw new Error('Nessun feed RSS disponibile. Verifica la connettività di rete.');
  }

  // Ordina per data (più recenti prima) e deduplicata per titolo simile
  allArticles.sort((a, b) => {
    const da = new Date(a.pubDate).getTime() || 0;
    const db = new Date(b.pubDate).getTime() || 0;
    return db - da;
  });

  // Deduplicazione: titoli con le prime 50 lettere identiche → tieni il più recente
  const seen = new Set<string>();
  const unique = allArticles.filter(a => {
    const key = a.title.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[ai-run] Feed totale: ${allArticles.length} articoli, unici: ${unique.length}`);
  return unique;
}

// ─── Analisi geopolitica con Claude ──────────────────────
async function analyzeWithClaude(articles: NewsArticle[]): Promise<MapEvent[]> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY non configurato');
  if (!apiKey.startsWith('sk-ant-')) {
    throw new Error(`ANTHROPIC_API_KEY formato non valido: inizia con "${apiKey.slice(0, 10)}"`);
  }

  // Prendi i 20 articoli più recenti — passa titolo + URL reale a Claude
  const top = articles.slice(0, 20);
  const headlines = top
    .map((a, i) => `${i + 1}. [${a.source}] ${a.title}\n   URL: ${a.url}`)
    .join('\n');

  const today = new Date().toISOString().slice(0, 10);

  const prompt = `Sei un sistema di intelligence geopolitica. Analizza SOLO queste notizie reali di OGGI (${today}) e seleziona i 5 eventi più rilevanti geopoliticamente.

NOTIZIE con URL reali (fonti: BBC, Reuters, Al Jazeera, NYT, The Guardian):
${headlines}

REGOLE FONDAMENTALI:
1. Usa ESCLUSIVAMENTE le informazioni presenti nelle notizie sopra — zero fatti dal training
2. Per "source_url" usa ESATTAMENTE l'URL fornito accanto alla notizia scelta — non inventare URL
3. Ogni evento deve corrispondere a una notizia specifica della lista

Rispondi SOLO con un array JSON, senza markdown, senza testo extra. Ogni oggetto:
{"title":"max 60 car in italiano","description":"max 120 car in italiano","lat":0.0,"lng":0.0,"category":"geopolitica|politica|business|tecnologia","magnitude":1|2|3|4,"ai_summary":"max 200 car in italiano basato sulla notizia","ai_brief":"2-3 frasi di contesto in italiano basate sulla notizia","source_url":"URL ESATTO dalla lista sopra","relevance_score":0-100,"expires_at":"${today}"}

Regole:
- Categoria: geopolitica=guerre/conflitti/tensioni tra stati, politica=elezioni/governi/proteste, business=economia/sanzioni/energia, tecnologia=cyber/AI/spazio
- Magnitudo: 1=bassa, 2=moderata, 3=alta, 4=critica/breaking
- expires_at: +30gg se mag 4, +21gg se mag 3, +14gg se mag ≤2
- Tutti i testi in ITALIANO
- Rispondi solo con l'array JSON`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5',
      max_tokens: 4096,
      messages:   [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API ${response.status}: ${err.slice(0, 500)}`);
  }

  const claude  = await response.json();
  const rawText = claude.content?.[0]?.text || '';
  console.log(`[ai-run] Claude: ${rawText.length} car, stop_reason=${claude.stop_reason}`);

  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error(`[ai-run] Nessun JSON array. Inizio: ${rawText.slice(0, 300)}`);
    throw new Error('Claude non ha restituito JSON valido');
  }

  const events: MapEvent[] = JSON.parse(jsonMatch[0]);
  return events.filter(e =>
    e.title &&
    typeof e.lat === 'number' && typeof e.lng === 'number' &&
    ['geopolitica','politica','business','tecnologia'].includes(e.category) &&
    e.magnitude >= 1 && e.magnitude <= 4
  );
}

// ─── Aggiorna citycams in base agli eventi attivi ─────────
async function updateCitycams(
  adminClient: ReturnType<typeof createClient>,
  events: MapEvent[]
) {
  const highPriority = events
    .filter(e => e.magnitude >= 3)
    .sort((a, b) => b.magnitude - a.magnitude || b.relevance_score - a.relevance_score)
    .slice(0, 8);

  for (const ev of highPriority) {
    const { data: nearby } = await adminClient
      .from('citycams')
      .select('id, ai_lock')
      .gte('lat', ev.lat - 5).lte('lat', ev.lat + 5)
      .gte('lng', ev.lng - 5).lte('lng', ev.lng + 5)
      .eq('ai_lock', false)
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
      const { data: profile } = await authedClient
        .from('profiles').select('role').eq('id', user.id).single();
      if (!profile || profile.role !== 'admin') {
        return errorResponse('Solo gli admin possono avviare la pipeline IA', 403);
      }
    }
  }

  // Crea job di log
  const { data: job, error: jobError } = await adminClient
    .from('ai_jobs')
    .insert({ status: 'running' })
    .select().single();
  if (jobError) return errorResponse(jobError.message, 500);
  const jobId = job.id;

  // Pipeline in background
  (async () => {
    let articlesProcessed = 0, eventsCreated = 0, eventsRenewed = 0, eventsResolved = 0;
    try {
      // 1. Recupera notizie dai feed RSS
      const newsArticles   = await fetchNewsFromRss();
      articlesProcessed    = newsArticles.length;

      // 2. Analisi con Claude → eventi strutturati
      const newEvents = await analyzeWithClaude(newsArticles);

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
          await adminClient.from('map_events').update({
            magnitude:       ev.magnitude,
            ai_summary:      ev.ai_summary,
            ai_brief:        ev.ai_brief,
            relevance_score: ev.relevance_score,
            expires_at:      ev.expires_at,
            source_url:      ev.source_url,
          }).eq('id', existingMap.get(key)!.id);
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
        .select('id, title');
      eventsResolved = (expired || []).length;

      // 6. Aggiorna citycams
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
