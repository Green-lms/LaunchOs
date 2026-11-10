# LaunchOS™ Backend — Complete Deployment Guide

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    LaunchOS™ Platform                        │
├──────────────┬──────────────────┬───────────────────────────┤
│ LaunchOS.html│LaunchOS_Admin.html│ LaunchOS_Trainer.html     │
│  (Founder /  │   (Admin Portal) │   (Trainer/Mentor Portal) │
│   Student)   │                  │                           │
└──────┬───────┴────────┬─────────┴────────────┬──────────────┘
       │                │                      │
       └────────────────┼──────────────────────┘
                        │  launchos-api.js (shared client)
                        │
               ┌────────▼────────┐
               │  Express API    │  :3000
               │  Node.js v18+   │
               ├─────────────────┤
               │  WebSocket /ws  │  Real-time sync
               ├─────────────────┤
               │    MongoDB      │  All data
               └─────────────────┘
```

## Quick Start

### 1. Install dependencies
```bash
cd launchos-node
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your values:
# - MONGODB_URI
# - JWT_SECRET (generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
# - SMTP_* settings
# - AI API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
```

### 3. Setup database
```bash
node scripts/setup.js
# Creates indexes, admin account
```

### 4. Load demo data (optional)
```bash
node scripts/seed.js
# Creates 6 demo founders, 5 trainers, 2 cohorts, sessions, messages
# All demo accounts use password: Demo@LaunchOS2026!
```

### 5. Start server
```bash
npm start          # production
npm run dev        # development with auto-reload (requires nodemon)
```

Server starts at: `http://localhost:3000`

---

## Connecting the Frontend Apps

### Option A: Include the API client script
Add before `</script>` in each HTML file:

```html
<!-- Set backend URL -->
<script>window.LAUNCHOS_API = 'http://localhost:3000';</script>
<!-- API client -->
<script src="launchos-api.js"></script>
```

### Option B: Inline the client
Copy the contents of `launchos-api.js` into each app's `<script>` block.

### Using the API from frontend code
```javascript
// Login (founder)
const r = await LOS.AuthAPI.login('arjun@startup.in', 'Demo@LaunchOS2026!');
if (r.success) {
  console.log('Logged in as:', r.user.name, '(' + r.user.role + ')');
}

// Save BMC step (auto-syncs with debounce)
LOS.Sync.onBMCStep(0, 'My passion is EdTech for underserved students in Tier-2 India...');

// Load programme data from backend
const prog = await LOS.Sync.loadFromBackend();
if (prog) {
  // Merge into local store
  Object.assign(store.bmc, Object.fromEntries(prog.bmc));
  store.assessments = prog.assessments;
}

// Book a session (trainer)
await LOS.SessionsAPI.book({
  founderId: 'founder_id_here',
  trainerId: 'trainer_id_here',
  type: 'SPARC™ Roleplay',
  date: '2026-03-25T10:00:00',
  duration: 60,
  notes: 'Focus on Probe stage',
});

// Send message
await LOS.MessagesAPI.send('recipient_id', 'Your SPARC script looks strong. One suggestion...', 'Script feedback');

// Use AI proxy (API key stays server-side)
const ai = await LOS.AIAPI.generate('Review this SPARC Probe script...', 'sparc');
console.log(ai.content);

// Real-time: listen for events
LOS.WSClient.on('new_message', (msg) => {
  showNotification('New message from ' + msg.message.from);
});

LOS.WSClient.on('founder_progress', (msg) => {
  console.log('Founder progressed:', msg.founderId, msg.event);
});
```

---

## API Reference

### Base URL: `http://localhost:3000/api`

### Auth
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | Public | Register (founder/trainer/admin) |
| POST | `/auth/login` | Public | Login, returns JWT |
| POST | `/auth/refresh` | Public | Refresh access token |
| POST | `/auth/logout` | All | Logout + revoke token |
| GET  | `/auth/me` | All | Get current user |
| PATCH| `/auth/me` | All | Update profile |
| PATCH| `/auth/change-password` | All | Change password |
| POST | `/auth/forgot-password` | Public | Send reset email |
| PATCH| `/auth/reset-password/:token` | Public | Reset password |

### Programme (Founder / Student data)
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET  | `/programme/me` | Founder | Get my full programme |
| GET  | `/programme/:founderId` | Trainer/Admin | Get any founder's programme |
| PUT  | `/programme/me/bmc/:step` | Founder | Save one BMC step (0–15) |
| PUT  | `/programme/me/bmc` | Founder | Bulk save all BMC steps |
| PUT  | `/programme/me/assessments` | Founder | Save assessment scores |
| PUT  | `/programme/me/offer` | Founder | Save offer design |
| PUT  | `/programme/me/capital` | Founder | Save capital budget |
| PUT  | `/programme/me/competitor` | Founder | Save competitor analysis |
| PUT  | `/programme/me/mvp` | Founder | Save MVP data |
| POST | `/programme/me/scripts/:type` | Founder | Save generated script |
| PUT  | `/programme/me/survey` | Founder | Save survey config |
| POST | `/programme/me/survey/response` | Public | Add survey response |
| PUT  | `/programme/me/survey/analysis` | Founder | Save survey AI analysis |
| PATCH| `/programme/me/stage` | All | Advance programme stage |
| POST | `/programme/:founderId/flag` | Trainer | Flag founder to admin |

### Sessions
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET  | `/sessions` | All | Get my sessions |
| POST | `/sessions` | All | Book new session |
| PATCH| `/sessions/:id` | All | Update session |
| POST | `/sessions/:id/feedback` | Trainer | Add post-session feedback |
| DELETE| `/sessions/:id` | All | Cancel session |

### Messages
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET  | `/messages` | All | Get inbox |
| GET  | `/messages/thread/:threadId` | All | Get thread |
| POST | `/messages` | All | Send message |
| PATCH| `/messages/:id/read` | All | Mark as read |
| GET  | `/messages/unread-count` | All | Get unread count |
| DELETE| `/messages/:id` | All | Delete message |

### Cohorts
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET  | `/cohorts` | All | Get my cohorts |
| POST | `/cohorts` | Trainer/Admin | Create cohort |
| PATCH| `/cohorts/:id` | Admin | Update cohort |
| POST | `/cohorts/:id/founders` | Admin | Add founder to cohort |
| DELETE| `/cohorts/:id/founders/:fId` | Admin | Remove founder |
| POST | `/cohorts/:id/trainers` | Admin | Assign trainer to cohort |
| POST | `/cohorts/assign-trainer` | Admin | Assign trainer to founder |
| POST | `/cohorts/:id/broadcast` | Admin/Trainer | Broadcast to cohort |

### Users (Admin)
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET  | `/users` | Admin/Trainer | List all users |
| GET  | `/users/:id` | Admin | Get one user |
| PATCH| `/users/:id` | Admin | Update user |
| DELETE| `/users/:id` | Admin | Deactivate user |
| GET  | `/users/:id/activity` | Admin | Get activity log |

### Reports
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET  | `/reports/programme` | Admin/Trainer | Programme analytics |
| POST | `/reports/trainer-feedback` | Trainer | Save feedback |
| GET  | `/reports/trainer-feedback/:founderId` | All | Get feedback |
| GET  | `/reports/export/:founderId` | All | Export full programme |

### AI
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/ai/generate` | All | AI generation (50/15min per user) |
| GET  | `/ai/health` | All | Check which providers are configured |
| GET  | `/ai/usage` | Admin | AI usage statistics |

---

## WebSocket Events

Connect: `ws://localhost:3000/ws?token=YOUR_JWT`

### Server → Client events
| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | userId, role | Confirmed connection |
| `pong` | ts | Response to ping |
| `new_message` | message object | New inbox message |
| `founder_progress` | founderId, event | Founder completed a step |
| `session_update` | session object | Session status changed |
| `notification` | notification object | In-app notification |
| `bmc_update` | founderId, step | Founder saved BMC step |
| `survey_response` | founderId, count | New survey response |
| `announcement` | subject, body, from | Cohort broadcast |

### Client → Server events
| Event | Payload | Description |
|-------|---------|-------------|
| `ping` | — | Keepalive |
| `presence` | panel | Current panel (for trainer dashboard) |
| `typing` | toUserId | Typing indicator in messages |

---

## Production Deployment

### MongoDB Atlas
```bash
# .env
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/launchos?retryWrites=true&w=majority
```

### PM2 (recommended for VPS)
```bash
npm install -g pm2
pm2 start src/server.js --name launchos-api
pm2 save
pm2 startup
```

### Nginx reverse proxy
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Environment variables for production
```bash
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<64-char-random-string>
FRONTEND_URL=https://yourapp.com
SMTP_HOST=smtp.gmail.com
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Security Notes

1. **JWT_SECRET** — Must be at least 64 random characters. Never commit to git.
2. **Invite codes** — Change `INVITE_CODE_TRAINER` and `INVITE_CODE_ADMIN` from defaults.
3. **Admin password** — Change immediately after first login.
4. **CORS** — Set `FRONTEND_URL` to your exact production domain.
5. **Rate limiting** — AI calls are limited to 50/15min per user. Adjust via `AI_RATE_LIMIT_MAX`.
6. **API keys** — All AI calls route through the backend. Keys are never sent to the browser.

---

## Demo Accounts (after running seed.js)

Password for all demo accounts: `Demo@LaunchOS2026!`

**Founders (students):**
- arjun@startup.in — EdTech, Stage 6
- priya@ventures.co — Skincare D2C, Stage 9 (graduated)
- rahul@scale.io — B2B SaaS, Stage 4
- neha@brand.com — Food Delivery, Stage 2
- kiran@fintech.in — FinTech, Stage 7
- divya@health.co — Mental Health, Stage 5

**Trainers / Mentors:**
- meera@launchos.in — SPARC mentor
- rajiv@launchos.in — BMC trainer
- ananya@launchos.in — Marketing mentor
- sanjay@launchos.in — Finance trainer
- preethi@launchos.in — MVP mentor

**Admin:**
- admin@launchos.app (password set in .env)
