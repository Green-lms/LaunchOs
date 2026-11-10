// ═══════════════════════════════════════════════════════════
// LaunchOS™ API Connector v4.0
// Drop this <script> block into LaunchOS.html, LaunchOS_Admin.html,
// LaunchOS_Trainer.html to connect them to the backend.
// 
// USAGE:
//   1. Set window.LAUNCHOS_API = 'https://your-api.com' BEFORE this script
//   2. API handles auth, real-time updates, and data sync automatically
//
// Place just before </body> in each HTML file.
// ═══════════════════════════════════════════════════════════
(function() {
'use strict';

const API_BASE = window.LAUNCHOS_API || 'http://localhost:4000';

// ── Token storage
const store = {
  get token()   { return localStorage.getItem('los_token'); },
  get refresh() { return localStorage.getItem('los_refresh'); },
  get user()    { try { return JSON.parse(localStorage.getItem('los_user') || 'null'); } catch(e) { return null; } },
  setAuth(token, refresh, user) {
    localStorage.setItem('los_token',   token);
    localStorage.setItem('los_refresh', refresh);
    localStorage.setItem('los_user',    JSON.stringify(user));
  },
  clearAuth() {
    ['los_token','los_refresh','los_user'].forEach(k => localStorage.removeItem(k));
  }
};

// ── HTTP helper with auto-refresh
async function api(method, path, body, opts = {}) {
  const doFetch = async (token) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const r = await fetch(API_BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      ...opts,
    });
    return r;
  };

  let r = await doFetch(store.token);

  // Auto-refresh if token expired
  if (r.status === 401) {
    const err = await r.json().catch(() => ({}));
    if (err.code === 'TOKEN_EXPIRED' && store.refresh) {
      try {
        const refreshR = await fetch(API_BASE + '/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: store.refresh }),
        });
        if (refreshR.ok) {
          const { token, refresh } = await refreshR.json();
          localStorage.setItem('los_token',   token);
          localStorage.setItem('los_refresh', refresh);
          r = await doFetch(token);
        } else {
          store.clearAuth();
          window.dispatchEvent(new CustomEvent('los:auth-expired'));
          throw new Error('Session expired — please log in again');
        }
      } catch (e) {
        store.clearAuth();
        throw e;
      }
    }
  }

  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(err.error || 'API error ' + r.status);
  }

  return r.json().catch(() => ({}));
}

// ── Public API surface ─────────────────────────────────────
const LOS = window.LaunchOS = {

  // Auth
  auth: {
    async register(data)  { const r = await api('POST','/api/auth/register',data); store.setAuth(r.token,r.refresh,r.user); return r; },
    async login(email,pass) { const r = await api('POST','/api/auth/login',{email,password:pass}); store.setAuth(r.token,r.refresh,r.user); return r; },
    async logout()        { await api('POST','/api/auth/logout',{refresh:store.refresh}).catch(()=>{}); store.clearAuth(); },
    async me()            { return api('GET','/api/auth/me'); },
    async forgotPassword(email) { return api('POST','/api/auth/forgot-password',{email}); },
    async resetPassword(token,password) { return api('POST','/api/auth/reset-password',{token,password}); },
    get user()            { return store.user; },
    get token()           { return store.token; },
    isLoggedIn()          { return !!store.token; },
  },

  // Users
  users: {
    list(params={})         { return api('GET', '/api/users?' + new URLSearchParams(params)); },
    get(id)                 { return api('GET', '/api/users/'+id); },
    update(id,data)         { return api('PUT', '/api/users/'+id, data); },
    assignTrainer(id,data)  { return api('POST','/api/users/'+id+'/assign-trainer', data); },
    updateStage(id,stage)   { return api('PUT', '/api/users/'+id+'/stage', {stage}); },
    delete(id)              { return api('DELETE','/api/users/'+id); },
  },

  // Programme (all 14 modules for each startup founder/student)
  programme: {
    get(founderId)                    { return api('GET',  '/api/programme/'+founderId); },
    saveBMCStep(fid,stepIndex,content){ return api('PUT',  '/api/programme/'+fid+'/bmc',{stepIndex,content}); },
    reviewBMCStep(fid,si,note,score)  { return api('PUT',  '/api/programme/'+fid+'/bmc/'+si+'/trainer-note',{note,score}); },
    saveOffer(fid,data)               { return api('PUT',  '/api/programme/'+fid+'/offer',data); },
    saveAssessment(fid,type,score,answers) { return api('PUT','/api/programme/'+fid+'/assessments',{type,score,answers}); },
    getSurvey(fid)                    { return api('GET',  '/api/programme/'+fid+'/survey'); },
    saveSurvey(fid,data)              { return api('PUT',  '/api/programme/'+fid+'/survey',data); },
    submitSurveyResponse(fid,answers) { return api('POST', '/api/programme/'+fid+'/survey/response',{answers}); },
    saveSurveyAnalysis(fid,analysis)  { return api('PUT',  '/api/programme/'+fid+'/survey/analysis',{analysis}); },
    saveScript(fid,type,content,ai)   { return api('PUT',  '/api/programme/'+fid+'/scripts',{type,content,aiGenerated:ai}); },
    saveCapital(fid,data)             { return api('PUT',  '/api/programme/'+fid+'/capital',data); },
    saveCompetitor(fid,data)          { return api('PUT',  '/api/programme/'+fid+'/competitor',data); },
    saveMVP(fid,data)                 { return api('PUT',  '/api/programme/'+fid+'/mvp',data); },
    addFeedback(fid,data)             { return api('POST', '/api/programme/'+fid+'/trainer-feedback',data); },
    getFeedback(fid)                  { return api('GET',  '/api/programme/'+fid+'/trainer-feedback'); },
    saveTrainerNotes(fid,note,isFlag) { return api('POST', '/api/programme/'+fid+'/trainer-notes',{note,isFlag}); },
  },

  // Sessions (appointments between founder/student and trainer)
  sessions: {
    list(params={})        { return api('GET',  '/api/sessions?'+new URLSearchParams(params)); },
    create(data)           { return api('POST', '/api/sessions', data); },
    get(id)                { return api('GET',  '/api/sessions/'+id); },
    update(id,data)        { return api('PUT',  '/api/sessions/'+id, data); },
    confirm(id)            { return api('PUT',  '/api/sessions/'+id, {status:'confirmed'}); },
    cancel(id,reason)      { return api('PUT',  '/api/sessions/'+id, {status:'cancelled',cancelReason:reason}); },
    complete(id,postSession){ return api('PUT', '/api/sessions/'+id, {postSession}); },
    delete(id)             { return api('DELETE','/api/sessions/'+id); },
  },

  // Messages (between all roles)
  messages: {
    list(params={})        { return api('GET',  '/api/messages?'+new URLSearchParams(params)); },
    send(data)             { return api('POST', '/api/messages', data); },
    thread(id)             { return api('GET',  '/api/messages/'+id+'/thread'); },
    markRead(id)           { return api('PUT',  '/api/messages/'+id+'/read'); },
    markAllRead()          { return api('PUT',  '/api/messages/read-all'); },
    unreadCount()          { return api('GET',  '/api/messages/unread-count'); },
  },

  // Cohorts
  cohorts: {
    list()                 { return api('GET',  '/api/cohorts'); },
    create(data)           { return api('POST', '/api/cohorts', data); },
    get(id)                { return api('GET',  '/api/cohorts/'+id); },
    update(id,data)        { return api('PUT',  '/api/cohorts/'+id, data); },
    addFounder(id,founderId){ return api('POST','/api/cohorts/'+id+'/add-founder',{founderId}); },
    removeFounder(id,fid)  { return api('POST', '/api/cohorts/'+id+'/remove-founder',{founderId:fid}); },
    addTrainer(id,trainerId){ return api('POST','/api/cohorts/'+id+'/add-trainer',{trainerId}); },
    progress(id)           { return api('GET',  '/api/cohorts/'+id+'/progress'); },
  },

  // Notifications
  notifications: {
    list(unread)           { return api('GET',  '/api/notifications'+(unread?'?unread=true':'')); },
    markRead(id)           { return api('PUT',  '/api/notifications/'+id+'/read'); },
    markAllRead()          { return api('PUT',  '/api/notifications/read-all'); },
  },

  // AI (server-side proxy — API keys stored safely on backend)
  ai: {
    generate(prompt, system, provider) { return api('POST','/api/ai/generate',{prompt,system,provider}); },
    analyseSurvey(founderId,context)   { return api('POST','/api/ai/survey-analysis',{founderId,context}); },
  },

  // Reports
  reports: {
    dashboard()   { return api('GET', '/api/reports/dashboard'); },
    founders()    { return api('GET', '/api/reports/founders'); },
    trainers()    { return api('GET', '/api/reports/trainers'); },
    cohorts()     { return api('GET', '/api/reports/cohorts'); },
  },

  // Moodle LMS
  moodle: {
    siteInfo()              { return api('GET',  '/api/moodle/site-info'); },
    courses()               { return api('GET',  '/api/moodle/courses'); },
    enrol(userId,courseId)  { return api('POST', '/api/moodle/enrol',{userId,courseId}); },
    createCourse(data)      { return api('POST', '/api/moodle/create-course',data); },
    users(courseId)         { return api('GET',  '/api/moodle/users/'+courseId); },
  },

  // WebSocket real-time connection
  ws: {
    socket: null,
    handlers: {},

    connect(onMessage) {
      if (!store.token) return console.warn('LOS WS: no token');
      const wsUrl = API_BASE.replace('http','ws') + '/ws?token=' + store.token;
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen    = () => console.log('[LOS] WS connected');
      this.socket.onclose   = () => { console.log('[LOS] WS disconnected'); setTimeout(() => this.connect(onMessage), 5000); };
      this.socket.onerror   = (e) => console.error('[LOS] WS error', e);
      this.socket.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (onMessage) onMessage(msg);
          // Fire registered event handlers
          if (this.handlers[msg.event]) this.handlers[msg.event].forEach(h => h(msg));
          if (this.handlers['*']) this.handlers['*'].forEach(h => h(msg));
        } catch(err) { console.error('[LOS] WS parse error', err); }
      };

      // Keepalive ping
      this._pingInterval = setInterval(() => {
        if (this.socket?.readyState === 1) this.socket.send(JSON.stringify({ event:'ping' }));
      }, 25000);
    },

    on(event, handler) {
      if (!this.handlers[event]) this.handlers[event] = [];
      this.handlers[event].push(handler);
    },

    send(event, data) {
      if (this.socket?.readyState === 1) this.socket.send(JSON.stringify({ event, ...data }));
    },

    disconnect() {
      clearInterval(this._pingInterval);
      this.socket?.close();
    },
  },
};

// ── Auto-connect WS if logged in
document.addEventListener('DOMContentLoaded', () => {
  if (LOS.auth.isLoggedIn()) {
    LOS.ws.connect((msg) => {
      // Default handlers: show toast for notifications
      if (msg.event === 'new_message') {
        const fn = window.showToast || window.showFeedback;
        if (fn) fn('New message from ' + (msg.message?.senderName || 'someone'));
      }
      if (msg.event === 'session_confirmed') {
        const fn = window.showToast || window.showFeedback;
        if (fn) fn('Session confirmed!');
      }
      if (msg.event === 'session_booked') {
        const fn = window.showToast || window.showFeedback;
        if (fn) fn('New session booked');
      }
      // Dispatch as DOM event so any app can listen
      window.dispatchEvent(new CustomEvent('los:ws', { detail: msg }));
    });
  }
});

// ── Auth-expired handler
window.addEventListener('los:auth-expired', () => {
  const fn = window.showToast || window.showFeedback || alert;
  fn('Session expired — please log in again');
  store.clearAuth();
  // Reload to show login screen
  setTimeout(() => window.location.reload(), 1500);
});

console.log('[LaunchOS™] API connector ready. Backend:', API_BASE);
})();
