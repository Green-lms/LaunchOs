const router  = require('express').Router();
const { Session, Notification } = require('../models/Cohort');
const User    = require('../models/User');
const { auth, roles } = require('../middleware/auth');
const ws      = require('../services/ws');

// GET /api/sessions — list sessions for current user
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    const { status, from, to } = req.query;
    if (req.user.role === 'founder')  query.founderId = req.user._id;
    if (req.user.role === 'trainer')  query.trainerId = req.user._id;
    // admin: all sessions (filter by query params if needed)
    if (req.query.founderId && req.user.role !== 'founder') query.founderId = req.query.founderId;
    if (req.query.trainerId && req.user.role !== 'trainer') query.trainerId = req.query.trainerId;
    if (status) query.status = status;
    if (from || to) { query.date = {}; if (from) query.date.$gte = new Date(from); if (to) query.date.$lte = new Date(to); }

    const sessions = await Session.find(query)
      .populate('founderId', 'name avatar founderProfile')
      .populate('trainerId', 'name avatar trainerProfile')
      .sort({ date: 1 });
    res.json({ sessions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/sessions — book a session
router.post('/', auth, roles('trainer','admin'), async (req, res) => {
  try {
    const { founderId, trainerId, type, date, duration, notes, prepForFounder, zoomLink, meetLink } = req.body;
    if (!founderId || !type || !date) return res.status(400).json({ error: 'founderId, type, date required' });

    const session = await Session.create({
      founderId, trainerId: trainerId || req.user._id, type, date: new Date(date),
      duration: duration || 60, notes, prepForFounder, zoomLink, meetLink,
      bookedBy: req.user._id, status: 'pending'
    });

    await session.populate('founderId','name email');
    await session.populate('trainerId','name email');

    // Notify founder
    await Notification.create({ userId: founderId, type: 'session_booked', title: 'Session booked', body: `${session.type.replace(/_/g,' ')} scheduled for ${new Date(date).toLocaleDateString()}`, data: { sessionId: session._id } });
    ws.notifyUser(founderId, { event: 'session_booked', session });

    res.status(201).json({ session });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/sessions/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const session = await Session.findById(req.params.id).populate('founderId','name avatar').populate('trainerId','name avatar');
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ session });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/sessions/:id — update session
router.put('/:id', auth, async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const { status, notes, prepForFounder, date, duration, zoomLink, meetLink, postSession } = req.body;
    if (status)       session.status       = status;
    if (notes)        session.notes        = notes;
    if (prepForFounder) session.prepForFounder = prepForFounder;
    if (date)         session.date         = new Date(date);
    if (duration)     session.duration     = duration;
    if (zoomLink)     session.zoomLink     = zoomLink;
    if (meetLink)     session.meetLink     = meetLink;
    if (postSession)  { session.postSession = postSession; session.status = 'completed'; }
    await session.save();
    await session.populate('founderId','name avatar');

    // Notify on confirm/cancel
    if (status === 'confirmed') {
      await Notification.create({ userId: session.founderId, type: 'session_confirmed', title: 'Session confirmed!', body: `Your session on ${new Date(session.date).toLocaleDateString()} is confirmed`, data: { sessionId: session._id } });
      ws.notifyUser(session.founderId, { event: 'session_confirmed', session });
    }
    if (status === 'cancelled') {
      ws.notifyUser(session.founderId, { event: 'session_cancelled', session });
    }

    res.json({ session });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/sessions/:id
router.delete('/:id', auth, roles('trainer','admin'), async (req, res) => {
  try {
    await Session.findByIdAndDelete(req.params.id);
    res.json({ message: 'Session deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;