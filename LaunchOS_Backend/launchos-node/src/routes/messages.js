const router = require('express').Router();
const { Message, Notification } = require('../models/Cohort');
const User   = require('../models/User');
const { auth } = require('../middleware/auth');
const ws     = require('../services/ws');

// GET /api/messages — inbox for current user
router.get('/', auth, async (req, res) => {
  try {
    const { type, unread, threadId } = req.query;
    const query = { $or: [{ receiverId: req.user._id }, { senderId: req.user._id }] };
    if (type)   query.type = type;
    if (unread === 'true') { query.receiverId = req.user._id; query.read = false; }
    if (threadId) { query.threadId = threadId; }
    else query.threadId = null; // root messages only by default
    const msgs = await Message.find(query)
      .populate('senderId',   'name avatar role')
      .populate('receiverId', 'name avatar role')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ messages: msgs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/messages — send a message
router.post('/', auth, async (req, res) => {
  try {
    const { receiverId, subject, body, type = 'direct', threadId, broadcastTo, cohortId } = req.body;
    if (!body) return res.status(400).json({ error: 'body required' });

    let recipients = [];
    if (broadcastTo === 'all_founders') {
      const founders = await User.find({ role: 'founder', status: 'active' }, '_id');
      recipients = founders.map(f => f._id);
    } else if (broadcastTo === 'cohort' && cohortId) {
      const { Cohort } = require('../models/Cohort');
      const cohort = await Cohort.findById(cohortId);
      recipients = cohort ? cohort.founders : [];
    } else if (broadcastTo === 'trainer_team') {
      const trainers = await User.find({ role: 'trainer', status: 'active' }, '_id');
      recipients = trainers.map(t => t._id);
    } else {
      if (!receiverId) return res.status(400).json({ error: 'receiverId or broadcastTo required' });
      recipients = [receiverId];
    }

    const created = [];
    for (const rid of recipients) {
      const msg = await Message.create({ senderId: req.user._id, receiverId: rid, subject, body, type, threadId: threadId || null, broadcastTo, cohortId });
      // Update reply count on parent
      if (threadId) await Message.findByIdAndUpdate(threadId, { $inc: { replyCount: 1 } });
      // Notify
      await Notification.create({ userId: rid, type: 'message_received', title: subject || ('Message from ' + req.user.name), body: body.slice(0, 100), data: { messageId: msg._id } });
      ws.notifyUser(rid, { event: 'new_message', message: { ...msg.toObject(), senderName: req.user.name, senderAvatar: req.user.avatar } });
      created.push(msg);
    }

    res.status(201).json({ message: created[0], count: created.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/messages/:id/thread — get thread replies
router.get('/:id/thread', auth, async (req, res) => {
  try {
    const msgs = await Message.find({ threadId: req.params.id })
      .populate('senderId', 'name avatar role')
      .sort({ createdAt: 1 });
    res.json({ thread: msgs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/messages/:id/read
router.put('/:id/read', auth, async (req, res) => {
  try {
    const msg = await Message.findOneAndUpdate(
      { _id: req.params.id, receiverId: req.user._id },
      { read: true, readAt: new Date() },
      { new: true }
    );
    res.json({ message: msg });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/messages/read-all
router.put('/read-all', auth, async (req, res) => {
  try {
    await Message.updateMany({ receiverId: req.user._id, read: false }, { read: true, readAt: new Date() });
    res.json({ message: 'All messages marked read' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/messages/unread-count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const count = await Message.countDocuments({ receiverId: req.user._id, read: false });
    res.json({ count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;