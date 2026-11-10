# LaunchOS™ — Full Audit Report & Roadmap

_Audit date: 10 Nov 2026 · Scope: every file in `C:\Users\mrfan\Downloads\LaunchOS` · No code was changed._

---

## 1. The short version

| Question | Answer |
|---|---|
| Do the 3 HTML portals open and work? | **Partly.** They open and look complete, but they run on **hard-coded demo data**. Admin and Trainer have real crash bugs, and buttons such as "Send", "Schedule" and "Complete" only show a toast without saving anything. |
| Are the portals linked to each other? | **No.** Each portal is an island. A message sent in Admin never reaches the Trainer or the Founder. Trainer and Admin show fake founders (Arjun, Divya…), not real founder data. |
| Is the founder's work saved? | **Only until the browser tab closes.** The founder portal uses `sessionStorage`, not `localStorage`. Closing the tab erases the BMC, offer, assessments and capital data. Scripts, AI chat and the new Capital module are not saved at all. |
| Is the backend complete? | **It is about 60% done and it will not run as-is.** The core is reasonable, but it contains two conflicting sets of models and routes, stale scripts, security holes, and no email sending. Some features the platform needs have no backend at all: social wall, announcements and ads. |
| Are the frontend and backend connected? | **No.** The founder login code expects a different response shape than the backend sends, so login would fail even with a server running. Admin and Trainer have no login at all. |
| Do the "social wall", "ads planning" and "announcements" features exist? | **No. They are not in any of these files.** Your project brief lists them, but they are not in the files you downloaded. Either they lived in a different chat version that was not exported, or they were never built. |
| Is Capital Budget restricted to some industries? | **No, that part is already fixed.** It supports any industry, 30 currencies (INR, USD, AED, GBP, EUR, SGD, AUD…) and custom categories. However, its data is never saved, and other modules still hard-code `₹` in their AI prompts. |
| Can I run the backend on this PC today? | **No.** Node.js, Git and MongoDB are not installed on this computer. |

---

## 2. What is actually in the folder

```
LaunchOS/
├── LaunchOS.html            Founder portal   (6,985 lines)  — most complete
├── LaunchOS_Admin.html      Admin portal     (1,971 lines)  — demo data only
├── LaunchOS_Trainer.html    Trainer portal   (1,065 lines)  — demo data only
└── LaunchOS_Backend/
    ├── api.php, setup_db.php, composer.json, .htaccess, .env.example
    │      ⚠ A SECOND, separate PHP backend (different API, different routes)
    ├── {app/  {app{Controllers,...}  {src{routes,...}   ⚠ junk empty folders (broken copy command)
    └── launchos-node/       Node/Express backend (the one to keep)
        ├── launchos-api-connector.js   ✅ matches the live Node routes
        ├── launchos-api.js             ⚠ OLD client (port 3000, cookie auth, PATCH) — does not match
        ├── scripts/setup.js            ✅ matches live models (creates admin + demo data)
        ├── scripts/seed.js             ⚠ uses OLD models + wrong env var (MONGODB_URI)
        └── src/
            ├── server.js               ✅ entry point
            ├── models/User.js, Programme.js, Cohort.js   ✅ used by live routes
            ├── models/index.js         ⚠ OLD duplicate schemas (different field names)
            ├── routes/auth, users, programme, sessions, messages, cohorts,
            │         notifications, ai, reports, moodle    ✅ mounted
            ├── routes/other.js         ⚠ dead code: never mounted, imports functions that don't exist
            ├── middleware/auth.js      ✅ used
            ├── middleware/errors.js    ⚠ unused
            └── services/ws.js ✅ used · websocket.js, email.js, notify.js ⚠ unused
```

**Conclusion:** two generations of code were mixed together during the chat sessions. The live Node path is `server.js` → `User.js/Programme.js/Cohort.js` → the 10 mounted routes → `ws.js` → `launchos-api-connector.js`. Everything marked ⚠ should be archived so it does not cause confusion.

---

## 3. Bugs found — Frontend

### 3.1 Founder portal (`LaunchOS.html`)

| # | Severity | Problem | Where |
|---|---|---|---|
| F1 | 🔴 Critical | **Founder work is lost when the tab closes.** State goes to `sessionStorage` (`launchos_state`), not `localStorage`. | `LaunchOS.html:1224`, `:1230` |
| F2 | 🔴 Critical | **Generated scripts, AI chat history and the new Capital module (`capState`) are never saved**, not even to sessionStorage. Survey and Empathy Map also use sessionStorage only. | `:1212-1226`, `:3385`, `:4205`, `:5815` |
| F3 | 🔴 Critical | **Login/Register can never succeed.** The code checks `r.success` and `r.data.token`, but the backend returns `{ token, refresh, user }`. | `:1109`, `:1122` |
| F4 | 🔴 Critical | **Claude AI calls from the browser fail on CORS.** The required header `anthropic-dangerous-direct-browser-access: true` is missing, so Claude (the default provider) errors out. | `:1387-1391` |
| F5 | 🟠 High | AI model list is outdated (`claude-sonnet-4-5`, `claude-opus-4-5`, `gpt-4-turbo`, `gemini-1.5`…). Some will be retired and return errors. | `:1285`, `:1296`, `:1307` |
| F6 | 🟠 High | Every founder must paste their own API key, which sits in plain text in the browser. That is a poor experience for non-technical founders and a key-leak risk. The backend already has a secure AI proxy (`/api/ai/generate`), but nothing uses it. | `:1349` |
| F7 | 🟡 Medium | Moodle course-sync reads `sessionStorage 'los_state'`, but data is saved under `launchos_state`, so the course name never pre-fills. The Moodle token is also stored in the browser. | `:5609`, `:5231` |
| F8 | 🟡 Medium | Two capital data models exist: an old `store.capital` (`country: 'India / INR'`) and a new `capState`. Offer, Competitor, MVP and Survey prompts and placeholders hard-code `₹`, so a UAE founder gets INR prices from the AI. | `:1169`, `:1712`, `:1773`, `:1790`, `:4231`, `:4312` |
| F9 | 🟡 Medium | Sidebar icon for Capital is `₹`, which is India-specific. | `:1972` |
| F10 | ⚪ Missing | **No Inbox, Announcements, Community/Social Wall, Sessions/Bookings, Notifications or Profile panels exist.** The founder cannot receive a trainer's message or see a booked session. | `NAV_ITEMS` `:1948-1983` |

✅ The founder portal has no undefined `onclick` functions, no duplicate IDs and a working navigation system. Its UI layer is in good shape.

### 3.2 Admin portal (`LaunchOS_Admin.html`)

| # | Severity | Problem | Where |
|---|---|---|---|
| A1 | 🔴 Critical | **`sendReply` does not exist, yet it is listed in the window-export object.** This throws a `ReferenceError` at load, so `renderTrainerComm`, `openTrainerChannel`, `sendTrainerReply`, `createCohort`, `addTrainer`, `assignFounderToCohort`, `broadcastToAll`, `broadcastCohort`, `switchReportTab`, `exportTrainerReport` and others are **never attached to `window`**. Most buttons on the **Trainers, Cohorts, Trainer Inbox and Reports** screens therefore do nothing (silent console error). This is very likely the "inbox links broken" issue you noticed. | `:1955-1966` |
| A2 | 🔴 Critical | The inbox "Send reply" button calls `sendReply(...)`, which does not exist. The function that does exist is `replyToMessage`. | `:662` |
| A3 | 🔴 Critical | **No login.** Anyone who opens the file is admin, and the "Switch to Mentor" button flips roles with no check. The admin name "Sushma Admin" is hard-coded. | `:359-362`, `:1905` |
| A4 | 🟠 High | All founders, trainers, cohorts and appointments are hard-coded `DEMO_*` arrays. Creating a cohort or adding a trainer only changes memory and is lost on refresh. | `:280-298` |
| A5 | 🟠 High | "AI Draft Email" reads the founder app's `los_ai_key`, which only works if both files run on the same origin. It also always calls Claude even when the saved key is for OpenAI, lacks the browser-access header, and uses an old model ID. | `:1787-1811` |
| A6 | 🟡 Medium | Message subject and body are inserted with `innerHTML` and no escaping. Once real users send messages, this becomes an XSS hole. | `:617-657` |
| A7 | ⚪ Missing | No Announcements broadcast to founders (only a demo), no Social moderation, no Ads Planning review. | — |

### 3.3 Trainer portal (`LaunchOS_Trainer.html`)

| # | Severity | Problem | Where |
|---|---|---|---|
| T1 | 🔴 Critical | Four inline handlers use `state.…`, but `state` is private inside the script's closure. Clicking them throws `state is not defined`. Affected: the **founder selector on Progress Notes**, the **Session Planner founder selector**, the "Full Notes" button in the founder modal, and one card button. | `:436`, `:504`, `:548`, `:903` |
| T2 | 🔴 Critical | **No login.** It is hard-coded as "Dr. Meera Iyer" (`ME`). | `:210-214` |
| T3 | 🟠 High | **Send Reply, Send message, Schedule & Notify, and Complete Session are fake.** They close the modal and show a "✓ sent" toast. Nothing is saved or delivered. | `:924`, `:941`, `:956`, `:999`, `:1022` |
| T4 | 🟠 High | Inbox messages are a `const` array. Read status is lost on refresh, and the sidebar unread badge never updates after opening a message. | `:240`, `:910-912` |
| T5 | 🟡 Medium | Rating stars in "Complete Session" and the "escalate" toggles are not captured anywhere. | `:869-877`, `:994` |
| T6 | 🟡 Medium | Demo data mentions a founder's "BSI profile / cortisol load". That is **health data**, which needs explicit consent and protection under India's DPDP Act and UAE PDPL. | `:244`, `:260` |

---

## 4. Bugs found — Backend (`launchos-node`)

### 4.1 Will not start or run correctly

| # | Problem |
|---|---|
| B1 | `.env` does not exist. Only `.env.example` does. |
| B2 | `node_modules` is not installed (`npm install` has never been run), and Node.js is not installed on this PC. |
| B3 | `scripts/seed.js` imports `src/models/index.js`, which uses **different field names** (`founder` vs `founderId`, `bmc` Map vs `bmc.steps[]`, `from/to` vs `senderId/receiverId`) and reads `MONGODB_URI` instead of `MONGO_URI`. Seeded data will be invisible to the live API. If both model files ever load in one process, Mongoose throws `OverwriteModelError`. → Use `scripts/setup.js` instead and delete or rewrite `seed.js`. |
| B4 | `routes/other.js` imports `protect`, `requireTrainer` and `requireAdmin`, which do not exist in `middleware/auth.js`. It is not mounted, so the server still starts, but it is dead and misleading. |
| B5 | `mongoose.connect(..., { useNewUrlParser, useUnifiedTopology })` uses deprecated options. Mongoose 7 ignores them with warnings. |

### 4.2 Security holes (must fix before real founders use it)

| # | Problem | File |
|---|---|---|
| S1 | **Any founder can broadcast to every founder or every trainer.** `POST /api/messages` with `broadcastTo:'all_founders'` has no role check. | `routes/messages.js:32-41` |
| S2 | **Any logged-in user can read any message thread.** `GET /api/messages/:id/thread` has no ownership check. | `routes/messages.js:63` |
| S3 | **Any founder can view or edit any session**, including changing its status. `GET/PUT /api/sessions/:id` has no ownership check. | `routes/sessions.js:52-88` |
| S4 | **A founder can edit their own `founderProfile`**, which includes `assignedTrainer`, `stage` and `cohortId`. A trainer can edit **any** user's profile. | `routes/users.js:36-52` |
| S5 | Any trainer can read or write **any** founder's BMC trainer-notes, feedback and private notes, not only their assigned founders. `GET /api/cohorts/:id` and `/progress` are open to any logged-in user. `/api/ai/survey-analysis` takes any `founderId`. | `programme.js:32,169,189`, `cohorts.js:32,83`, `ai.js:51` |
| S6 | Trainer/admin self-registration is protected only by `adminKey === ADMIN_PASSWORD`, so the admin's login password doubles as a registration key. | `routes/auth.js:16` |
| S7 | Password-reset tokens are stored in plain text, and **the reset email is never sent**. The flow is unusable. | `routes/auth.js:73-83` |
| S8 | Error responses return raw `err.message` from every route, which leaks internals. `PUT /api/cohorts/:id` passes the whole `req.body` to `findByIdAndUpdate`, enabling mass-assignment. | all routes, `cohorts.js:45` |
| S9 | No NoSQL-injection sanitising (`express-mongo-sanitize`), no input validation (Joi is installed but unused), and a 10 MB JSON body limit on every route. | `server.js:27` |
| S10 | Rate-limit is wrong behind a host proxy (Railway/Render): `trust proxy` is not set, so every user shares one IP bucket and all get blocked together. | `server.js:36-41` |
| S11 | The public survey-response endpoint has no spam protection, so anyone can flood a founder's survey. | `programme.js:95` |
| S12 | The WebSocket accepts anonymous connections. Refresh tokens are kept forever in an unbounded array. | `ws.js:46`, `auth.js:42` |

### 4.3 Functional gaps

| # | Gap |
|---|---|
| G1 | **No email is ever sent.** `services/email.js` reads `SMTP_*`, `services/notify.js` reads `EMAIL_*`, and neither is imported by any live route. Invites, password reset, session reminders and feedback emails therefore do not work. |
| G2 | **No models or routes for the Social Wall** (posts, likes, comments, reactions), **Announcements**, **Ads Planning**, **Empathy Map**, **AI Coach chat history** or **file uploads** (multer is installed but unused). |
| G3 | The AI proxy uses an outdated model ID, ignores HTTP errors, never logs usage (the `AIUsage` model exists only in the dead `index.js`), and has no per-founder quota. Your Anthropic bill is uncapped. |
| G4 | No admin "invite founder" flow. Founders self-register into no cohort, and nothing tells admin a new founder signed up. |
| G5 | Deleting a user leaves orphan Programme, Session and Message records. |
| G6 | No automated tests, no logging or monitoring, no DB backups configured. |
| G7 | The connector's `sessions.cancel()` sends `cancelReason`, but the route ignores it. |

### 4.4 The PHP backend (`api.php`)
This is a completely separate, simpler backend with a different URL scheme (`/api/programme/bmc` with no founder ID). It cannot work alongside the Node one. **Recommendation:** archive it and keep Node only, because Node already has roles, cohorts, sessions, messaging and WebSockets.

---

## 5. What I need from you

### 5.1 Decisions (only you can make these)

| # | Decision | My recommendation |
|---|---|---|
| D1 | Keep the **Node** backend and archive the PHP one? | ✅ Yes, Node |
| D2 | **Who pays for AI?** (a) The Reset Labs pays: one central API key on the server with a monthly quota per founder. (b) Each founder brings their own key, as now. | (a) Central key with quotas. Founders shouldn't need to know what an API key is. Keep (b) only as an optional override. |
| D3 | Do the **Social Wall / Ads Planning / Announcements** files exist in another Claude chat? | If yes, export those versions and send them to me. If not, I'll build them fresh. |
| D4 | **Hosting**: Railway (≈ US$5–20/mo, easiest) vs AWS Lightsail (cheaper at scale, more setup) vs Render. Frontend: Netlify vs Vercel vs Cloudflare Pages (all free). | Railway + MongoDB Atlas (free M0, upgrade to M10 at go-live) + Netlify |
| D5 | **URLs**, for example `app.theresetlabs.global` (founder), `admin.…`, `trainer.…`, `api.…` — or a single `app.` with all three portals under it. | One domain, `app.theresetlabs.global`, with `/`, `/admin` and `/trainer`, plus `api.theresetlabs.global`. One origin also makes login simpler. |
| D6 | **Login style**: email + password only, or also Google sign-in, or magic-link email? | Email + password plus an admin **invite link** for v1. Google sign-in in v2. |
| D7 | Is the programme **paid inside the platform**? (Razorpay for India / Stripe for UAE) | Defer to v2 unless the first cohort pays online |
| D8 | Keep **Moodle** integration (`corporate.thegreenlms.com`)? | Keep it only if you actively use that LMS. Otherwise hide it for v1. |
| D9 | Should founders and trainers see the **BSI / stress / health** fields? | Only with explicit consent and admin-only access. Otherwise remove them. |
| D10 | Target date and size of the **first live cohort** | Needed to size the plan |

### 5.2 Accounts & credentials (create these; **don't paste secrets into chat** — put them in the `.env` file yourself, or I'll guide you)

1. **GitHub** account and a private repo, for version control and auto-deploy.
2. **MongoDB Atlas** account with a cluster → gives `MONGO_URI`.
3. **Railway** (or chosen host) account → backend URL.
4. **Netlify** account → frontend URL.
5. **DNS access** for `theresetlabs.global` (GoDaddy, Cloudflare, or wherever it is registered) to add `app.` and `api.` records.
6. **Anthropic API key** from an org account with billing set up, plus an optional OpenAI key for fallback.
7. **Email sending**: either a Google Workspace app password, or (better) **Resend / Postmark / SendGrid** with a verified sending domain (SPF/DKIM records on `theresetlabs.global`). Also choose a from-address such as `hello@theresetlabs.global`.
8. **Admin login**: the email you'll log in with, plus a strong initial password (set in `.env`, never in chat).
9. **Moodle web-service token**, only if D8 = keep.
10. **Sentry** (free) for error alerts and **UptimeRobot** (free) for uptime. Optional but recommended.

### 5.3 Content & business inputs

1. The **real programme structure**: stages, weekly timeline, what "complete" means per stage, and deadlines (or confirm the current 9 stages and the 16-step BMC).
2. **Assessment questions and scoring** (confirm the existing 4 tests are correct).
3. **Trainer resources**: the real SPARC™ guide, objection bank, VSL rubric and session plans as PDF/DOC. The Trainer portal currently lists fake files.
4. **Real trainer and mentor list** (name, email, specialty) and the **first cohort's details**.
5. **Brand assets**: logo (SVG/PNG), favicon, final colours (confirm violet `#6c5ce7`), and email footer.
6. **Legal pages**: Privacy Policy and Terms of Use, plus consent text for AI processing and any health data. These are required in both India (DPDP Act 2023) and the UAE (PDPL).
7. Support contact (email or WhatsApp) shown inside the app.

### 5.4 On this computer
Install **Node.js 20 LTS**, **Git** and **VS Code**. MongoDB Compass is optional, for viewing data. None of these are installed now.

---

## 6. Roadmap

Effort estimates assume I do the engineering and you answer decisions and supply credentials promptly.

### Phase 0 — Clean-up & foundations (½ day)
- Create a Git repo and commit the current files as the "as-downloaded" baseline.
- Move dead or duplicate files into `/_archive`: `api.php`, `setup_db.php`, `composer.json`, `.htaccess`, `models/index.js`, `routes/other.js`, `scripts/seed.js`, `launchos-api.js`, unused services, and the junk `{app…` folders.
- Propose a final structure: `frontend/` (3 portals plus a shared `launchos-api-connector.js`) and `backend/`.
- Write `.env.example` with **one** consistent set of variable names.

**Done when:** the repo is clean, there is one backend and one API client, and nothing in it is ambiguous.

### Phase 1 — Make the portals work properly offline (1–2 days)
Goal: every button works, and nothing is lost on refresh, even before the backend exists.
1. Admin: fix the `sendReply` crash (A1/A2) so every Trainers, Cohorts, Trainer Inbox and Reports button works.
2. Trainer: fix the 4 `state is not defined` handlers (T1). Make reply, compose, schedule and complete-session actually store data, and update unread badges (T3–T5).
3. Founder: one persistent `localStorage` store covering every module, including scripts, chat, capital (`capState`), survey and empathy map. Add JSON **export/import backup** (F1/F2/F7).
4. Fix Claude browser calls (F4) and update model lists to current models (F5).
5. Make currency global: the founder picks a currency once in profile, and every module, prompt and placeholder uses it (F8/F9).
6. Escape all user-generated HTML (A6).

**Done when:** a manual click-through of every panel in all 3 portals shows no console errors, and data survives a browser restart.

### Phase 2 — Backend: production-ready core (3–4 days)
1. Install and boot locally; check `/health`; fix startup warnings (B1–B5).
2. Use one response format everywhere (`{ success, data, error }`), plus a central error handler, Joi validation and mongo-sanitize (S8/S9).
3. **Close every authorization hole** S1–S5 with a single helper: "can this user access this founder?" (self / assigned trainer / admin).
4. Auth hardening: a separate `ADMIN_INVITE_KEY` (S6), an admin **invite-founder/trainer** flow (G4), hashed and expiring reset tokens with an actual email (S7), capped refresh tokens (S12), `trust proxy` (S10), and a per-route body-size limit.
5. **Email service**: one module with one set of env vars, wired to invite, password reset, session booked/confirmed/reminder, feedback received and announcements (G1).
6. **AI proxy v2**: current models, Claude-first with OpenAI fallback, error handling, usage logging and a per-founder monthly quota, plus admin visibility of spend (G3).
7. Cascade or soft-delete for users (G5), and a CAPTCHA or rate limit on the public survey (S11).
8. Basic automated API tests for auth, permissions and programme save/load.

**Done when:** tests pass, a founder cannot see another founder's data, and emails arrive.

### Phase 3 — New backend modules for missing features (2–3 days)
- **Announcements**: admin or trainer → all / cohort / individual, with read receipts.
- **Community / Social Wall**: posts, comments, likes and reactions (one per user per type, toggle), cohort-scoped visibility, report/flag, and admin moderation (hide/delete/pin).
- **Ads Planning**: founder submits an ad plan (platform, budget in their currency, audience, creative copy); trainer/admin reviews with status and comments.
- **Empathy Map, AI Coach chat history, Survey public link** (shareable URL for respondents), and **file uploads** (avatars, resources, ad creatives) via cloud storage.
- **Trainer resources library**: admin uploads, trainers and founders download.

### Phase 4 — Connect frontends to the backend (3–4 days)
1. Add `launchos-api-connector.js` to all 3 portals, plus a single config line: `window.LAUNCHOS_API = 'https://api.theresetlabs.global'`.
2. **Login screen and role gate** on all 3 portals. The founder portal keeps "offline mode" only as a fallback.
3. **Founder**: load the programme on login, auto-save each module (debounced) with a "Saved ✓ / Offline – will sync" indicator, and migrate existing local data on first login. New panels: **Inbox, Announcements, Community, My Sessions, Notifications bell, Profile**.
4. **Trainer**: real assigned founders, read-only view of each founder's BMC/scripts with step-level review notes and scores, real sessions, inbox and feedback.
5. **Admin**: real founders, trainers and cohorts; assign founder ↔ trainer ↔ cohort; broadcast announcements; moderate the wall; review ad plans; reports from `/api/reports/*`; AI spend view.
6. Real-time WebSocket updates for new messages, session changes and announcements.

**Done when:** a founder, a trainer and an admin, logged in on three different devices, see each other's actions within seconds.

### Phase 5 — Deploy (1 day, after your accounts exist)
Atlas cluster (IP allow-list, DB user) → Railway backend (env vars, `npm run setup` to create admin) → Netlify frontend → DNS for `app.` and `api.` with HTTPS → lock CORS to the real domain → smoke-test all three roles → Sentry and UptimeRobot alerts → enable Atlas backups.

### Phase 6 — Pilot-cohort readiness (2–3 days)
- **Onboarding flow**: application/interest form → admin approves → invite email → founder sets password → welcome checklist.
- **Programme calendar**: weekly milestones per cohort, deadlines, and reminders by email.
- **Session booking**: trainer availability → founder books → Google Calendar link and reminder 24 h before.
- **Progress and at-risk alerts**: no login for 5 days, or stage overdue → nudge founder and alert trainer.
- **Graduation**: completion certificate (PDF) and a demo-day showcase page.
- Privacy policy and terms pages, consent checkbox on signup, "download my data" and "delete my account".
- Mobile check on a phone browser (many founders will use phones).
- Short help guides (1 page per role) and a feedback button.
- Dry-run with 2–3 friendly testers before the real cohort.

### Later (v2 ideas)
Google sign-in · in-app payments (Razorpay/Stripe) · WhatsApp notifications (big for India/UAE) · Hindi/Arabic UI · founder public profile/pitch page · investor demo-day portal · AI-generated weekly progress summary for trainers · PWA install on phone.

**Total to a pilot-ready platform: about 2.5–3.5 weeks of focused work.** A first "real login with persistent data" milestone is possible within the first week (Phases 0–2 plus a minimal Phase 4).

---

## 7. Gaps a real launch cohort would hit

1. Founders lose their work when they close the tab (F1).
2. Nobody can log in to Admin or Trainer securely (A3, T2).
3. Messages and session bookings never reach the other person (T3, F10).
4. There is no way to invite founders, reset a password or send any email (G1, G4, S7).
5. Founders need their own AI key, and the default Claude provider fails anyway (F4, F6).
6. Founders can read or modify other founders' data via the API (S1–S5).
7. There is no community, announcements or ad-review tool, although the brief promises them (G2).
8. There are no backups, monitoring, privacy policy or consent text.

---

## 8. Suggested next step
Answer the decisions in **§5.1** (even quick yes/no answers are fine). Then I'll start **Phase 0 + Phase 1**. These need no accounts or credentials and immediately make all three portals bug-free and persistent on your machine. In parallel, you create the accounts in **§5.2** and install Node.js and Git (§5.4).
