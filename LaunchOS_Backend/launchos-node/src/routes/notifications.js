const router = require('express').Router();
const { Notification } = require('../models/Cohort');
const { auth } = require('../middleware/auth');

// GET /api/notifications
router.get('/', auth, async (req, res) => {
  try {
    const { unread } = req.query;
    const query = { userId: req.user._id };
    if (unread === 'true') query.read = false;
    const notifications = await Notification.find(query).sort({ createdAt: -1 }).limit(50);
    const unreadCount   = await Notification.countDocuments({ userId: req.user._id, read: false });
    res.json({ notifications, unreadCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', auth, async (req, res) => {
  try {
    await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { read: true, readAt: new Date() });
    res.json({ message: 'Marked as read' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/notifications/read-all
router.put('/read-all', auth, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user._id, read: false }, { read: true, readAt: new Date() });
    res.json({ message: 'All notifications read' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;