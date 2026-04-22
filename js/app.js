/* =========================================================
   ANALISY — Shared App Logic
   ========================================================= */

/* ── AUTH ── */
const Auth = {
  get()        { try { return JSON.parse(localStorage.getItem('analisy_user')) || null; } catch { return null; } },
  set(user)    { localStorage.setItem('analisy_user', JSON.stringify(user)); },
  clear()      { localStorage.removeItem('analisy_user'); localStorage.removeItem('analisy_jwt'); localStorage.removeItem('analisy_refresh'); },
  getToken()   { return localStorage.getItem('analisy_jwt') || null; },
  setToken(t)  { localStorage.setItem('analisy_jwt', t); },
  isLoggedIn() { return !!this.getToken() && !!this.get(); },
  isAdmin()    { const u = this.get(); return u && u.role === 'admin'; },
  isPremium()     { const u = this.get(); return u && (u.plan === 'premium' || u.plan === 'pro' || u.role === 'admin'); },
  isForumMember() { const u = this.get(); return u && (u.plan === 'pro' || u.role === 'admin'); },

  /* Legge il profilo direttamente dalla REST API (fallback affidabile) */
  async _fetchProfile(userId) {
    const token = this.getToken();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,email,nome,cognome,role,plan,sub_status&limit=1`,
      { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` } }
    );
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  },

  /* Login via Supabase Auth — poi carica il profilo esteso dalla Edge Function */
  async login(email, password) {
    const data = await SupaAuth.signIn(email, password);
    const u = data.user || {};

    /* 1° tentativo: Edge Function auth-me */
    try {
      const profile = await Api.fn('auth-me');
      this.set(profile);
      return profile;
    } catch { /* continua */ }

    /* 2° tentativo: REST API diretta (più affidabile, bypassa Edge Function) */
    try {
      const row = await this._fetchProfile(u.id);
      if (row) {
        const profile = {
          id:         row.id,
          email:      row.email || u.email,
          nome:       row.nome       || u.user_metadata?.nome    || '',
          cognome:    row.cognome    || u.user_metadata?.cognome || '',
          role:       row.role       || 'user',
          plan:       row.plan       || 'free',
          sub_status: row.sub_status || 'inactive',
        };
        this.set(profile);
        return profile;
      }
    } catch { /* continua */ }

    /* 3° tentativo (last resort): user_metadata */
    const profile = {
      id:         u.id,
      email:      u.email,
      nome:       u.user_metadata?.nome    || '',
      cognome:    u.user_metadata?.cognome || '',
      role:       u.user_metadata?.role    || 'user',
      plan:       u.user_metadata?.plan    || 'free',
      sub_status: u.user_metadata?.sub_status || 'inactive',
    };
    this.set(profile);
    return profile;
  },

  /* Registrazione via Supabase Auth */
  async register(data) {
    const { nome, cognome, email, password, ...rest } = data;
    await SupaAuth.signUp(email, password, { nome, cognome, ...rest });
    /* Dopo la registrazione eseguiamo il login per ottenere il token */
    return this.login(email, password);
  },

  /* Verifica e aggiorna il profilo (chiamata all'avvio di ogni pagina protetta) */
  async verify() {
    if (!this.getToken()) return null;
    if (SupaAuth.isTokenExpired()) {
      const refreshed = await SupaAuth.refreshSession().catch(() => null);
      if (!refreshed?.access_token) { this.clear(); return null; }
    }

    /* 1° tentativo: Edge Function */
    try {
      const profile = await Api.fn('auth-me');
      this.set(profile);
      return profile;
    } catch { /* continua */ }

    /* 2° tentativo: REST API diretta */
    try {
      const u = this.get();
      if (u?.id) {
        const row = await this._fetchProfile(u.id);
        if (row) {
          const profile = { ...u, role: row.role, plan: row.plan, sub_status: row.sub_status };
          this.set(profile);
          return profile;
        }
      }
    } catch { /* continua */ }

    this.clear();
    return null;
  },
};

/* ── NAVBAR ── */
function renderNavbar() {
  const user    = Auth.get();
  const actions = document.getElementById('navbar-actions');
  if (!actions) return;
  if (user) {
    const initial  = (user.nome || 'U')[0].toUpperCase();
    const dashLink = user.role === 'admin' ? 'admin.html' : 'dashboard.html';
    actions.innerHTML = `
      <a href="${dashLink}" class="nav-avatar" title="${user.nome} ${user.cognome}">${initial}</a>
      <button class="help-btn" title="Aiuto" onclick="document.getElementById('help-modal')?.classList.add('open')">?</button>
      <a href="situation-room.html" class="btn btn-primary btn-sm">Situation Room</a>
    `;
  }
}
document.addEventListener('DOMContentLoaded', renderNavbar);

/* ── TOAST ── */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

/* ── LOGOUT ── */
async function logout() {
  await SupaAuth.signOut().catch(() => Auth.clear());
  window.location.href = 'index.html';
}

/* ── AUTH GUARDS ── */
function requireAuth(redirect = 'login.html') {
  if (!Auth.isLoggedIn()) { window.location.href = redirect; return false; }
  return true;
}
function requireAdmin(redirect = 'index.html') {
  if (!Auth.isAdmin()) { window.location.href = redirect; return false; }
  return true;
}

/* ── BADGE HELPERS ── */
function getPlanBadge(plan) {
  const badges = {
    free:    '<span style="color:var(--text-muted)">Free</span>',
    premium: '<span style="color:var(--accent-blue)">Premium</span>',
    pro:     '<span style="color:var(--accent-purple)">Pro</span>',
  };
  return badges[plan] || badges.free;
}
function getStatusBadge(status) {
  const map = {
    active:   '<span class="sub-status-badge active">Attivo</span>',
    inactive: '<span class="sub-status-badge inactive">Inattivo</span>',
    expired:  '<span class="sub-status-badge expired">Scaduto</span>',
  };
  return map[status] || map.inactive;
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' });
}

/* ── CONTENT GETTERS (leggono dalla cache AppData) ── */
function getArticles()     { return (typeof AppData !== 'undefined') ? AppData.articles     : []; }
function getPodcasts()     { return (typeof AppData !== 'undefined') ? AppData.podcasts     : []; }
function getCitycams()     { return (typeof AppData !== 'undefined') ? AppData.citycams     : []; }
function getMapEvents()    { return (typeof AppData !== 'undefined') ? AppData.mapEvents    : []; }
function getMapResources() { return (typeof AppData !== 'undefined') ? AppData.mapResources : []; }
