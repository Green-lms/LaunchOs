// ═══════════════════════════════════════════════════════════
// LaunchOS™ — Frontend API Client v4.0
// Drop this script into LaunchOS.html, LaunchOS_Admin.html,
// and LaunchOS_Trainer.html to connect them to the backend.
//
// Usage:
//   <script src="launchos-api.js"></script>
//   OR paste contents before </script> in each HTML file
//
// Config:
//   window.LAUNCHOS_API = 'https://your-backend.com'  (default: http://localhost:3000)
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';

  const BASE = (window.LAUNCHOS_API || 'http://localhost:3000').replace(/\/$/, '');

  // ── Token management ─────────────────────────────────────
  const Auth = {
    getToken()        { return localStorage.getItem('los_token'); },
    setToken(t)       { localStorage.setItem('los_token', t); },
    removeToken()     { localStorage.removeItem('los_token'); localStorage.removeItem('los_user'); },
    getUser()         { try { return JSON.parse(localStorage.getItem('los_user') || 'null'); } catch { return null; } },
    setUser(u)        { localStorage.setItem('los_user', JSON.stringify(u)); },
    isLoggedIn()      { return !!this.getToken(); },
    get role()        { return this.getUser()?.role || null; },
  };

  // ── Core fetch wrapper ────────────────────────────────────
  async function api(method, path, body, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = Auth.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const cfg = { method, headers, credentials: 'include' };
    if (body && method !== 'GET') cfg.body = JSON.stringify(body);

    try {
      const res = await fetch(BASE + path, cfg);
      const data = await res.json();

      // Auto-refresh on 401
      if (res.status === 401 && !opts.noRefresh) {
        const refreshed = await _refresh();
        if (refreshed) return api(method, path, body, { ...opts, noRefresh: true });
        Auth.removeToken();
        window.dispatchEvent(new CustomEvent('los:logout'));
        return { success: false, error: 'Session expired — please log in again' };
      }

      return data;
    } catch (err) {
      return { success: false, error: 'Network error: ' + err.message };
    }
  }

  async function _refresh() {
    try {
      const r = await fetch(BASE + '/api/auth/refresh', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (d.success && d.token) { Auth.setToken(d.token); return true; }
      return false;
    } catch { return false; }
  }

  const get   = (path, opts)       => api('GET',    path, null, opts);
  const post  = (path, body, opts) => api('POST',   path, body, opts);
  const put   = (path, body, opts) => api('PUT',    path, body, opts);
  const patch = (path, body, opts) => api('PATCH',  path, body, opts);
  const del   = (path, opts)       => api('DELETE', path, null, opts);

  // ══════════════════════════════════════════════════════════
  // AUTH API
  // ══════════════════════════════════════════════════════════
  const AuthAPI = {
    async register(name, email, password, role, inviteCode, extra) {
      const r = await post('/api/auth/register', { name, email, password, role, inviteCode, ...extra });
      if (r.success) { Auth.setToken(r.token); Auth.setUser(r.user); }
      return r;
    },
    async login(email, password) {
      const r = await post('/api/auth/login', { email, password });
      if (r.success) { Auth.setToken(r.token); Auth.setUser(r.user); }
      return r;
    },
    async logout() {
      await post('/api/auth/logout', {});
      Auth.removeToken();
    },
    async me()                   { return get('/api/auth/me'); },
    async updateProfile(data)    { return patch('/api/auth/me', data); },
    async changePassword(cur, nw){ return patch('/api/auth/change-password', { currentPassword: cur, newPassword: nw }); },
    async forgotPassword(email)  { return post('/api/auth/forgot-password', { email }); },
    async resetPassword(token, password) { return patch('/api/auth/reset-password/' + token, { password }); },
  };

  // ══════════════════════════════════════════════════════════
  // PROGRAMME API (founder / student)
  // ══════════════════════════════════════════════════════════
  const ProgrammeAPI = {
    async get()                            { return get('/api/programme/me'); },
    async getFor(founderId)                { return get('/api/programme/' + founderId); },
    async saveBMCStep(step, content)       { return put('/api/programme/me/bmc/' + step, { content }); },
    async saveBMCBulk(bmc)                 { return put('/api/programme/me/bmc', { bmc }); },
    async saveAssessments(scores)          { return put('/api/programme/me/assessments', scores); },
    async saveOffer(data)                  { return put('/api/programme/me/offer', data); },
    async saveCapital(data)                { return put('/api/programme/me/capital', data); },
    async saveCompetitor(data)             { return put('/api/programme/me/competitor', data); },
    async saveMVP(data)                    { return put('/api/programme/me/mvp', data); },
    async saveScript(type, content, inputs){ return post('/api/programme/me/scripts/' + type, { content, inputs }); },
    async saveSurvey(data)                 { return put('/api/programme/me/survey', data); },
    async addSurveyResponse(founderId, answers, source) {
      return post('/api/programme/me/survey/response', { founderId, answers, source });
    },
    async saveSurveyAnalysis(analysis)     { return put('/api/programme/me/survey/analysis', { analysis }); },
    async advanceStage(stage)              { return patch('/api/programme/me/stage', { stage }); },
    async flagFounder(founderId, message, type) {
      return post('/api/programme/' + founderId + '/flag', { message, type });
    },
    async getNotifications()               { return get('/api/programme/me/notifications'); },
    async markNotificationRead(id)         { return patch('/api/programme/me/notifications/' + id + '/read', {}); },
  };

  // ══════════════════════════════════════════════════════════
  // SESSIONS API
  // ══════════════════════════════════════════════════════════
  const SessionsAPI = {
    async getAll()                    { return get('/api/sessions'); },
    async book(data)                  { return post('/api/sessions', data); },
    async update(id, data)            { return patch('/api/sessions/' + id, data); },
    async addFeedback(id, feedback)   { return post('/api/sessions/' + id + '/feedback', feedback); },
    async cancel(id)                  { return del('/api/sessions/' + id); },
    async confirm(id)                 { return patch('/api/sessions/' + id, { status: 'confirmed' }); },
  };

  // ══════════════════════════════════════════════════════════
  // MESSAGES API
  // ══════════════════════════════════════════════════════════
  const MessagesAPI = {
    async getInbox()                  { return get('/api/messages'); },
    async getThread(threadId)         { return get('/api/messages/thread/' + threadId); },
    async send(toId, body, subject, type, threadId, parentId) {
      return post('/api/messages', { toId, body, subject, type, threadId, parentId });
    },
    async markRead(id)                { return patch('/api/messages/' + id + '/read', {}); },
    async getUnreadCount()            { return get('/api/messages/unread-count'); },
    async delete(id)                  { return del('/api/messages/' + id); },
  };

  // ══════════════════════════════════════════════════════════
  // COHORTS API
  // ══════════════════════════════════════════════════════════
  const CohortsAPI = {
    async getAll()                    { return get('/api/cohorts'); },
    async create(data)                { return post('/api/cohorts', data); },
    async update(id, data)            { return patch('/api/cohorts/' + id, data); },
    async addFounder(cohortId, founderId) { return post('/api/cohorts/' + cohortId + '/founders', { founderId }); },
    async removeFounder(cohortId, founderId) { return del('/api/cohorts/' + cohortId + '/founders/' + founderId); },
    async addTrainer(cohortId, trainerId) { return post('/api/cohorts/' + cohortId + '/trainers', { trainerId }); },
    async assignTrainer(founderId, trainerId) { return post('/api/cohorts/assign-trainer', { founderId, trainerId }); },
    async broadcast(cohortId, subject, body) { return post('/api/cohorts/' + cohortId + '/broadcast', { subject, body }); },
  };

  // ══════════════════════════════════════════════════════════
  // USERS API (admin)
  // ══════════════════════════════════════════════════════════
  const UsersAPI = {
    async getAll(params = {})         { return get('/api/users?' + new URLSearchParams(params)); },
    async getOne(id)                  { return get('/api/users/' + id); },
    async update(id, data)            { return patch('/api/users/' + id, data); },
    async deactivate(id)              { return del('/api/users/' + id); },
    async getActivity(id)             { return get('/api/users/' + id + '/activity'); },
  };

  // ══════════════════════════════════════════════════════════
  // REPORTS API
  // ══════════════════════════════════════════════════════════
  const ReportsAPI = {
    async getProgrammeStats()         { return get('/api/reports/programme'); },
    async saveFeedback(data)          { return post('/api/reports/trainer-feedback', data); },
    async getFeedback(founderId)      { return get('/api/reports/trainer-feedback/' + founderId); },
    async exportFounder(founderId)    { return get('/api/reports/export/' + founderId); },
  };

  // ══════════════════════════════════════════════════════════
  // AI API
  // ══════════════════════════════════════════════════════════
  const AIAPI = {
    async generate(prompt, module, system, provider) {
      return post('/api/ai/generate', { prompt, module, system, provider });
    },
    async generateWithMessages(messages, module, system, provider) {
      return post('/api/ai/generate', { messages, module, system, provider });
    },
    async getHealth()    { return get('/api/ai/health'); },
    async getUsage()     { return get('/api/ai/usage'); },
  };

  // ══════════════════════════════════════════════════════════
  // WEBSOCKET CLIENT
  // ══════════════════════════════════════════════════════════
  let ws       = null;
  let wsReconn = null;
  let wsHandlers = {};

  const WSClient = {
    connect() {
      const token = Auth.getToken();
      if (!token) return;
      const wsUrl = BASE.replace(/^http/, 'ws') + '/ws?token=' + token;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('LaunchOS™ WS connected');
        window.dispatchEvent(new CustomEvent('los:ws-connected'));
        if (wsReconn) { clearInterval(wsReconn); wsReconn = null; }
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          // Dispatch as DOM event
          window.dispatchEvent(new CustomEvent('los:' + msg.type, { detail: msg }));
          // Call registered handlers
          const handlers = wsHandlers[msg.type] || [];
          handlers.forEach(h => h(msg));
          wsHandlers['*']?.forEach(h => h(msg));
        } catch (_) {}
      };

      ws.onclose = (e) => {
        console.log('LaunchOS™ WS disconnected — reconnecting in 5s');
        if (!wsReconn) wsReconn = setInterval(() => WSClient.connect(), 5000);
      };

      ws.onerror = (e) => console.error('LaunchOS™ WS error');
    },

    disconnect() {
      if (wsReconn) clearInterval(wsReconn);
      if (ws) ws.close();
    },

    on(type, handler) {
      if (!wsHandlers[type]) wsHandlers[type] = [];
      wsHandlers[type].push(handler);
    },

    off(type, handler) {
      if (wsHandlers[type]) wsHandlers[type] = wsHandlers[type].filter(h => h !== handler);
    },

    send(type, payload) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...payload }));
    },

    // Presence heartbeat — tell server which panel user is on
    presence(panel) { this.send('presence', { panel }); },
  };

  // ══════════════════════════════════════════════════════════
  // SYNC — Save local state to backend on changes
  // ══════════════════════════════════════════════════════════
  const Sync = {
    _debounceTimers: {},

    // Debounced save — won't spam the API
    debounce(key, fn, delay = 1500) {
      clearTimeout(this._debounceTimers[key]);
      this._debounceTimers[key] = setTimeout(fn, delay);
    },

    // Called when founder saves a BMC step in LaunchOS.html
    onBMCStep(step, content) {
      this.debounce('bmc_' + step, () => {
        ProgrammeAPI.saveBMCStep(step, content).then(r => {
          if (!r.success) console.warn('BMC sync failed:', r.error);
          else console.log('✓ BMC step', step + 1, 'synced');
        });
      }, 2000);
    },

    // Called when founder runs an assessment
    onAssessments(scores) {
      ProgrammeAPI.saveAssessments(scores).then(r => {
        if (!r.success) console.warn('Assessment sync failed:', r.error);
      });
    },

    // Called when a script is generated
    onScriptGenerated(type, content) {
      ProgrammeAPI.saveScript(type, content).then(r => {
        if (!r.success) console.warn('Script sync failed:', r.error);
        else console.log('✓ Script synced:', type);
      });
    },

    // Called when survey response added
    onSurveyResponse(answers) {
      const user = Auth.getUser();
      if (!user) return;
      ProgrammeAPI.addSurveyResponse(user._id, answers).then(r => {
        if (r.success) console.log('✓ Survey response synced');
      });
    },

    // Called when AI generates analysis
    onSurveyAnalysis(analysis) {
      ProgrammeAPI.saveSurveyAnalysis(analysis).then(r => {
        if (!r.success) console.warn('Analysis sync failed:', r.error);
      });
    },

    // Bulk sync entire local store to backend
    async fullSync(store) {
      if (!Auth.isLoggedIn()) return;
      console.log('LaunchOS™ full sync starting...');
      const results = await Promise.allSettled([
        store.bmc && Object.keys(store.bmc).length
          ? ProgrammeAPI.saveBMCBulk(store.bmc) : Promise.resolve(),
        store.assessments
          ? ProgrammeAPI.saveAssessments(store.assessments) : Promise.resolve(),
        store.offer
          ? ProgrammeAPI.saveOffer(store.offer) : Promise.resolve(),
        store.capital
          ? ProgrammeAPI.saveCapital(store.capital) : Promise.resolve(),
        store.competitor
          ? ProgrammeAPI.saveCompetitor(store.competitor) : Promise.resolve(),
      ]);
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length) console.warn('Sync: ' + failed.length + ' items failed');
      else console.log('✓ Full sync complete');
    },

    // Load backend data into local store
    async loadFromBackend() {
      if (!Auth.isLoggedIn()) return null;
      const r = await ProgrammeAPI.get();
      if (!r.success) return null;
      return r.programme;
    },
  };

  // ══════════════════════════════════════════════════════════
  // NOTIFICATIONS — poll + WS
  // ══════════════════════════════════════════════════════════
  const Notifications = {
    _badge: null,

    init(badgeElementId) {
      this._badge = document.getElementById(badgeElementId);
      this._poll();
      // Listen for WS notifications
      WSClient.on('notification', (msg) => this._show(msg.notification));
      WSClient.on('new_message',  (msg) => this._showMsg(msg.message));
    },

    async _poll() {
      const r = await ProgrammeAPI.getNotifications();
      if (r.success) {
        const unread = r.notifications.filter(n => !n.read).length;
        if (this._badge) this._badge.textContent = unread || '';
      }
      setTimeout(() => this._poll(), 60000);  // poll every 60s
    },

    _show(n) {
      // Browser notification if permitted
      if (Notification?.permission === 'granted') {
        new Notification('LaunchOS™ — ' + n.title, { body: n.body, icon: '/favicon.ico' });
      }
      // In-app toast
      window.dispatchEvent(new CustomEvent('los:notification', { detail: n }));
    },

    _showMsg(m) {
      window.dispatchEvent(new CustomEvent('los:new_message', { detail: m }));
    },

    async requestPermission() {
      if (Notification?.permission !== 'granted') await Notification?.requestPermission?.();
    },
  };

  // ══════════════════════════════════════════════════════════
  // AUTO-CONNECT on load
  // ══════════════════════════════════════════════════════════
  window.addEventListener('load', () => {
    if (Auth.isLoggedIn()) {
      WSClient.connect();
    }
    // Listen for login events
    window.addEventListener('los:login', () => WSClient.connect());
    window.addEventListener('los:logout', () => WSClient.disconnect());
  });

  // ══════════════════════════════════════════════════════════
  // EXPOSE PUBLIC API
  // ══════════════════════════════════════════════════════════
  window.LOS = {
    Auth,
    AuthAPI,
    ProgrammeAPI,
    SessionsAPI,
    MessagesAPI,
    CohortsAPI,
    UsersAPI,
    ReportsAPI,
    AIAPI,
    WSClient,
    Sync,
    Notifications,
    // Convenience
    isLoggedIn:  () => Auth.isLoggedIn(),
    currentUser: () => Auth.getUser(),
    currentRole: () => Auth.role,
  };

  // Quick access shorthands
  window.LOS_AUTH     = AuthAPI;
  window.LOS_PROG     = ProgrammeAPI;
  window.LOS_SESSIONS = SessionsAPI;
  window.LOS_MSGS     = MessagesAPI;
  window.LOS_COHORTS  = CohortsAPI;
  window.LOS_AI       = AIAPI;
  window.LOS_SYNC     = Sync;

  console.log('LaunchOS™ API client loaded — backend:', BASE);
})();
