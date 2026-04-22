/* =========================================================
   ANALISY — API Client  (Supabase + GitHub Pages)
   =========================================================
   Configurazione:
     SUPABASE_URL  → URL del progetto Supabase
     SUPABASE_ANON → chiave pubblica "anon" (safe da esporre)

   I token JWT vengono gestiti direttamente da Supabase Auth.
   Le chiamate al backend passano per Supabase Edge Functions
   (cartella /supabase/functions/) oppure via REST API nativa.
   ========================================================= */

/* ── CONFIGURAZIONE SUPABASE ──────────────────────────────
   Sostituisci questi due valori con i tuoi dalla
   dashboard Supabase → Project Settings → API
   ──────────────────────────────────────────────────────── */
const SUPABASE_URL  = 'https://ncjvntiacegmlqrtnqvt.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5janZudGlhY2VnbWxxcnRucXZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NTk2NDAsImV4cCI6MjA5MjQzNTY0MH0.R2TQ5k7LaSV8o09yUUEXjVVZjzUI3HYOA8YiUBPzQJw';

/* =========================================================
   SUPABASE AUTH CLIENT
   Wrapper leggero attorno all'API REST di Supabase Auth
   senza dipendere dal bundle npm (compatibile con GitHub Pages).
   ========================================================= */
const SupaAuth = {
  /* ── Registrazione ── */
  async signUp(email, password, meta = {}) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: _authHeaders(),
      body: JSON.stringify({ email, password, data: meta }),
    });
    return _handleAuthRes(res);
  },

  /* ── Login con email/password ── */
  async signIn(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: _authHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const data = await _handleAuthRes(res);
    if (data.access_token) {
      localStorage.setItem('analisy_jwt',         data.access_token);
      localStorage.setItem('analisy_refresh',     data.refresh_token || '');
      localStorage.setItem('analisy_user',        JSON.stringify(data.user || {}));
    }
    return data;
  },

  /* ── Logout ── */
  async signOut() {
    const token = localStorage.getItem('analisy_jwt');
    if (token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: _authHeaders(token),
      }).catch(() => {});
    }
    localStorage.removeItem('analisy_jwt');
    localStorage.removeItem('analisy_refresh');
    localStorage.removeItem('analisy_user');
  },

  /* ── Recupera utente corrente (da cache locale) ── */
  currentUser() {
    try {
      return JSON.parse(localStorage.getItem('analisy_user') || 'null');
    } catch { return null; }
  },

  /* ── Rinnovo token tramite refresh_token ── */
  async refreshSession() {
    const refresh = localStorage.getItem('analisy_refresh');
    if (!refresh) return null;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: _authHeaders(),
      body: JSON.stringify({ refresh_token: refresh }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.access_token) {
      localStorage.setItem('analisy_jwt',     data.access_token);
      localStorage.setItem('analisy_refresh', data.refresh_token || refresh);
    }
    return data;
  },

  /* ── Controlla se il token è ancora valido (lato client) ── */
  isTokenExpired() {
    const token = localStorage.getItem('analisy_jwt');
    if (!token) return true;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 < Date.now();
    } catch { return true; }
  },
};

/* ─────────────────────────────────────────────────────────
   HELPERS INTERNI
   ───────────────────────────────────────────────────────── */
function _authHeaders(token) {
  const h = {
    'Content-Type': 'application/json',
    'apikey':       SUPABASE_ANON,
  };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function _handleAuthRes(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || `Errore HTTP ${res.status}`);
  return data;
}

/* =========================================================
   API CLIENT — Edge Functions + Supabase REST
   =========================================================
   Le Edge Functions vivono in /supabase/functions/<name>
   e vengono chiamate come:
     POST https://PROJECT.supabase.co/functions/v1/<name>
   ========================================================= */
const Api = {
  async request(method, endpoint, body) {
    /* Rinfresca token in automatico se scaduto */
    if (SupaAuth.isTokenExpired()) {
      await SupaAuth.refreshSession().catch(() => {});
    }

    const token = localStorage.getItem('analisy_jwt');
    const opts  = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    const res  = await fetch(endpoint, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || `Errore HTTP ${res.status}`);
    return data;
  },

  /* Shorthand helpers */
  get:    (ep)       => Api.request('GET',    ep),
  post:   (ep, body) => Api.request('POST',   ep, body),
  put:    (ep, body) => Api.request('PUT',    ep, body),
  patch:  (ep, body) => Api.request('PATCH',  ep, body),
  del:    (ep, body) => Api.request('DELETE', ep, body),
  delete: (ep, body) => Api.request('DELETE', ep, body),

  /* ── Chiamata a una Edge Function ──────────────────────
     Uso: Api.fn('ai-run', { force: true })
     Corrisponde a: POST /functions/v1/ai-run
     ───────────────────────────────────────────────────── */
  async fn(name, body) {
    return Api.request('POST', `${SUPABASE_URL}/functions/v1/${name}`, body);
  },

  /* ── Query Supabase REST (tabelle dirette) ─────────────
     Uso: Api.table('articles').select('*').eq('status','published')
     Wrapper minimo — per query complesse usa il client
     ufficiale @supabase/supabase-js.
     ───────────────────────────────────────────────────── */
  table(tableName) {
    const base  = `${SUPABASE_URL}/rest/v1/${tableName}`;
    const params = [];
    const obj   = {
      select(cols = '*') { params.push(`select=${cols}`); return obj; },
      eq(col, val)       { params.push(`${col}=eq.${val}`); return obj; },
      neq(col, val)      { params.push(`${col}=neq.${val}`); return obj; },
      order(col, asc = true) { params.push(`order=${col}.${asc ? 'asc' : 'desc'}`); return obj; },
      limit(n)           { params.push(`limit=${n}`); return obj; },
      async get()        { return Api.request('GET', base + '?' + params.join('&')); },
      async insert(data) { return Api.request('POST', base, data); },
      async update(data, match) {
        const q = Object.entries(match).map(([k,v]) => `${k}=eq.${v}`).join('&');
        return Api.request('PATCH', `${base}?${q}`, data);
      },
      async remove(match) {
        const q = Object.entries(match).map(([k,v]) => `${k}=eq.${v}`).join('&');
        return Api.request('DELETE', `${base}?${q}`);
      },
    };
    return obj;
  },
};

/* =========================================================
   APP DATA — Cache condivisa tra tutte le pagine
   =========================================================
   Gli endpoint puntano alle Edge Functions di Supabase
   (es. /functions/v1/articles) oppure alla REST API
   nativa di Supabase (Api.table()).
   ========================================================= */
const AppData = {
  articles:    [],
  podcasts:    [],
  citycams:    [],
  mapEvents:   [],
  mapResources:[],

  async init() {
    try {
      const [arts, pods, cams, evs, res] = await Promise.all([
        Api.fn('articles', { filter: 'published' }),
        Api.fn('podcasts'),
        Api.fn('citycams'),
        Api.fn('map-events'),
        Api.fn('map-resources'),
      ]);
      this.articles     = Array.isArray(arts) ? arts : [];
      this.podcasts     = Array.isArray(pods) ? pods : [];
      this.citycams     = Array.isArray(cams) ? cams : [];
      this.mapEvents    = Array.isArray(evs)  ? evs  : [];
      this.mapResources = Array.isArray(res)  ? res  : [];
    } catch(e) {
      console.error('[AppData.init]', e.message);
    }
  },

  async initAdmin() {
    try {
      const [arts, pods, cams, evs, res, users] = await Promise.all([
        Api.fn('articles', { filter: 'all' }),
        Api.fn('podcasts'),
        Api.fn('citycams'),
        Api.fn('map-events'),
        Api.fn('map-resources'),
        Api.fn('admin-users'),
      ]);
      this.articles     = Array.isArray(arts)  ? arts  : [];
      this.podcasts     = Array.isArray(pods)  ? pods  : [];
      this.citycams     = Array.isArray(cams)  ? cams  : [];
      this.mapEvents    = Array.isArray(evs)   ? evs   : [];
      this.mapResources = Array.isArray(res)   ? res   : [];
      this.users        = Array.isArray(users) ? users : [];
    } catch(e) {
      console.error('[AppData.initAdmin]', e.message);
    }
  },
};
