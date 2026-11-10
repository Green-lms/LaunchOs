// ═══════════════════════════════════════════════════════════
// LaunchOS™ WebSocket Service
// Handles real-time events across founder, trainer, admin apps
// Events: new_message, session_booked, session_confirmed,
//         bmc_updated, survey_response, notification, ping
// ═══════════════════════════════════════════════════════════

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');

// Map: userId (string) -> Set of WebSocket connections
const connections = new Map();

function init(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    // Extract token from query string: /ws?token=xxx
    const url   = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    let userId = null;
    let userRole = null;

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId   = String(decoded.id);
        userRole = decoded.role;

        if (!connections.has(userId)) connections.set(userId, new Set());
        connections.get(userId).add(ws);

        ws.userId   = userId;
        ws.userRole = userRole;
        ws.isAlive  = true;

        // Confirm connection
        ws.send(JSON.stringify({ event: 'connected', userId, role: userRole, time: new Date().toISOString() }));
        console.log(`WS connected: ${userId} (${userRole}) — total connections: ${totalConnections()}`);
      } catch (err) {
        ws.send(JSON.stringify({ event: 'error', message: 'Invalid token' }));
        ws.close();
        return;
      }
    } else {
      // Allow anonymous for survey responses
      ws.send(JSON.stringify({ event: 'connected', anonymous: true }));
    }

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        handleClientMessage(ws, msg);
      } catch (e) {
        ws.send(JSON.stringify({ event: 'error', message: 'Invalid JSON' }));
      }
    });

    ws.on('close', () => {
      if (userId && connections.has(userId)) {
        connections.get(userId).delete(ws);
        if (connections.get(userId).size === 0) connections.delete(userId);
      }
      console.log(`WS disconnected: ${userId || 'anon'}`);
    });

    ws.on('error', (err) => {
      console.error('WS error for', userId, err.message);
    });
  });

  // Heartbeat — ping every 30s, close dead connections
  const interval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) { ws.terminate(); return; }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(interval));

  console.log('WebSocket server initialised');
  return wss;
}

// ── Handle incoming client messages ──────────────────────
function handleClientMessage(ws, msg) {
  switch (msg.event) {
    case 'ping':
      ws.send(JSON.stringify({ event: 'pong', time: new Date().toISOString() }));
      break;

    case 'typing':
      // Forward typing indicator to recipient
      if (msg.toUserId) {
        notifyUser(msg.toUserId, { event: 'typing', fromUserId: ws.userId, fromName: msg.fromName });
      }
      break;

    case 'read_message':
      // Notify sender that message was read
      if (msg.messageId && msg.senderId) {
        notifyUser(msg.senderId, { event: 'message_read', messageId: msg.messageId, readBy: ws.userId });
      }
      break;

    default:
      break;
  }
}

// ── Send to specific user (all their connections) ─────────
function notifyUser(userId, payload) {
  const id = String(userId);
  if (!connections.has(id)) return false;
  const data = JSON.stringify({ ...payload, serverTime: new Date().toISOString() });
  let sent = 0;
  connections.get(id).forEach(ws => {
    if (ws.readyState === 1) { // OPEN
      ws.send(data);
      sent++;
    }
  });
  return sent > 0;
}

// ── Broadcast to all users of a given role ────────────────
function broadcastToRole(role, payload) {
  const data = JSON.stringify({ ...payload, serverTime: new Date().toISOString() });
  connections.forEach((wsSet, userId) => {
    wsSet.forEach(ws => {
      if (ws.userRole === role && ws.readyState === 1) ws.send(data);
    });
  });
}

// ── Broadcast to all ──────────────────────────────────────
function broadcastAll(payload) {
  const data = JSON.stringify({ ...payload, serverTime: new Date().toISOString() });
  connections.forEach(wsSet => {
    wsSet.forEach(ws => { if (ws.readyState === 1) ws.send(data); });
  });
}

// ── Broadcast to multiple specific users ─────────────────
function notifyUsers(userIds, payload) {
  userIds.forEach(id => notifyUser(id, payload));
}

// ── Stats ─────────────────────────────────────────────────
function totalConnections() {
  let total = 0;
  connections.forEach(set => { total += set.size; });
  return total;
}

function getOnlineUsers() {
  return [...connections.keys()];
}

module.exports = { init, notifyUser, notifyUsers, broadcastToRole, broadcastAll, getOnlineUsers, totalConnections };
