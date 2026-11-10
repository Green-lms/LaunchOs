// ═══════════════════════════════════════════════════════════
// LaunchOS™ — WebSocket Service
// Real-time sync across founder, trainer & admin apps
// ═══════════════════════════════════════════════════════════

const WebSocket = require('ws');
const jwt       = require('jsonwebtoken');

let wss = null;
// Map: userId -> Set of WebSocket connections (multi-tab support)
const connections = new Map();

function init(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Auth via query param ?token=...
    const url    = new URL(req.url, 'http://localhost');
    const token  = url.searchParams.get('token');
    let userId   = null;
    let userRole = null;

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId   = decoded.id;
      userRole = decoded.role;
    } catch (_) {
      ws.close(4001, 'Unauthorised');
      return;
    }

    // Register connection
    if (!connections.has(userId)) connections.set(userId, new Set());
    connections.get(userId).add(ws);
    ws._userId = userId;
    ws._role   = userRole;

    console.log(`WS connected: ${userId} (${userRole}) — total connections: ${wss.clients.size}`);

    // Send welcome + ping interval
    send(ws, { type: 'connected', userId, role: userRole, ts: Date.now() });

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 30000);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        handleClientMessage(ws, userId, userRole, msg);
      } catch (_) {}
    });

    ws.on('close', () => {
      clearInterval(ping);
      const set = connections.get(userId);
      if (set) { set.delete(ws); if (set.size === 0) connections.delete(userId); }
      console.log(`WS disconnected: ${userId}`);
    });

    ws.on('error', (err) => console.error('WS error:', err.message));
  });

  console.log('WebSocket server initialised');
  return wss;
}

// ── Handle messages from clients ─────────────────────────
function handleClientMessage(ws, userId, role, msg) {
  switch (msg.type) {
    case 'ping':
      send(ws, { type: 'pong', ts: Date.now() });
      break;
    case 'presence':
      // Broadcast presence to connected trainers/admins
      broadcastToRoles(['trainer','admin'], {
        type:   'founder_active',
        userId,
        panel:  msg.panel,
        ts:     Date.now(),
      });
      break;
    case 'typing':
      // Forward typing indicator to recipient
      if (msg.toUserId) sendToUser(msg.toUserId, { type: 'typing', fromUserId: userId, ts: Date.now() });
      break;
    default:
      break;
  }
}

// ── Send to one WebSocket connection ──────────────────────
function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

// ── Send to all connections of a specific user ────────────
function sendToUser(userId, payload) {
  const set = connections.get(userId.toString());
  if (set) set.forEach(ws => send(ws, payload));
}

// ── Send to multiple users ────────────────────────────────
function sendToUsers(userIds, payload) {
  userIds.forEach(id => sendToUser(id.toString(), payload));
}

// ── Broadcast to all connections with specific role ───────
function broadcastToRoles(roles, payload) {
  if (!wss) return;
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN && roles.includes(ws._role)) {
      send(ws, payload);
    }
  });
}

// ── Broadcast to ALL connected users ─────────────────────
function broadcastAll(payload) {
  if (!wss) return;
  wss.clients.forEach(ws => send(ws, payload));
}

// ── Event emitters — called from route handlers ───────────

// New message received
function emitNewMessage(message, recipientId) {
  sendToUser(recipientId, {
    type:    'new_message',
    message: {
      _id:     message._id,
      from:    message.from,
      subject: message.subject,
      body:    message.body.slice(0, 80),
      createdAt: message.createdAt,
    },
  });
}

// Founder completed a programme step
function emitFounderProgress(founderId, trainerId, event) {
  const payload = { type: 'founder_progress', founderId, event, ts: Date.now() };
  if (trainerId) sendToUser(trainerId, payload);
  broadcastToRoles(['admin'], payload);
}

// Session status changed
function emitSessionUpdate(session, affectedUserIds) {
  sendToUsers(affectedUserIds, {
    type:    'session_update',
    session: {
      _id:    session._id,
      status: session.status,
      date:   session.date,
      type:   session.type,
    },
  });
}

// Notification
function emitNotification(userId, notification) {
  sendToUser(userId, {
    type:         'notification',
    notification: {
      _id:   notification._id,
      title: notification.title,
      body:  notification.body,
      link:  notification.link,
    },
  });
}

// BMC step saved by founder — notify trainer
function emitBMCUpdate(founderId, step, trainerId) {
  if (trainerId) sendToUser(trainerId, {
    type:      'bmc_update',
    founderId,
    step,
    ts:        Date.now(),
  });
}

// Survey response received
function emitSurveyResponse(founderId, count, trainerId) {
  const payload = { type: 'survey_response', founderId, count, ts: Date.now() };
  if (trainerId) sendToUser(trainerId, payload);
  broadcastToRoles(['admin'], payload);
}

// Admin broadcasts to cohort
function emitCohortAnnouncement(cohortFounderIds, message) {
  sendToUsers(cohortFounderIds, {
    type:    'announcement',
    message,
    ts:      Date.now(),
  });
}

module.exports = {
  init, send, sendToUser, sendToUsers, broadcastToRoles, broadcastAll,
  emitNewMessage, emitFounderProgress, emitSessionUpdate, emitNotification,
  emitBMCUpdate, emitSurveyResponse, emitCohortAnnouncement,
};
