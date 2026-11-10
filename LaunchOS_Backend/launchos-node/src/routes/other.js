// ═══════════════════════════════════════════════════════════
// LaunchOS™ — Sessions Routes
// ═══════════════════════════════════════════════════════════

const express  = require('express');
const router   = express.Router();
const { Session, User, Notification, Activity } = require('../models');
const { protect, requireTrainer, requireAdmin } = require('../middleware/auth');
const { ok, fail, catchAsync }                  = require('../middleware/errors');
const ws                                        = require('../services/websocket');
const emailSvc                                  = require('../services/email');

// ── Get my sessions ────────────────────────────────────────
router.get('/', protect, catchAsync(async (req, res) => {
  const { user } = req;
  const filter = user.role === 'founder' ? { founder: user._id }
               : user.role === 'trainer' ? { trainer: user._id }
               : {};  // admin sees all

  const sessions = await Session.find(filter)
    .populate('founder', 'name email avatar businessName')
    .populate('trainer', 'name email avatar specialty')
    .sort({ date: 1 });
  return ok(res, { sessions });
}));

// ── Book session ───────────────────────────────────────────
router.post('/', protect, catchAsync(async (req, res) => {
  const { founderId, trainerId, type, date, duration, notes, prepNote } = req.body;

  // Founders book with their trainer; trainers/admins can book on behalf
  let actualFounderId = req.user.role === 'founder' ? req.user._id : founderId;
  let actualTrainerId = req.user.role === 'trainer' ? req.user._id : trainerId;

  if (!actualFounderId || !actualTrainerId || !type || !date) {
    return fail(res, 'founderId, trainerId, type and date are required');
  }

  const session = await Session.create({
    founder:    actualFounderId,
    trainer:    actualTrainerId,
    type, duration: duration || 60,
    date:       new Date(date),
    notes, prepNote,
    status:     req.user.role === 'founder' ? 'pending' : 'confirmed',
    createdBy:  req.user._id,
  });

  await session.populate('founder', 'name email avatar');
  await session.populate('trainer', 'name email avatar');

  await Activity.create({ user: req.user._id, type: 'session_booked', message: `Booked ${type} session`, metadata: { sessionId: session._id } });

  // Real-time notifications
  ws.emitSessionUpdate(session, [actualFounderId.toString(), actualTrainerId.toString()]);

  // Email notifications
  const founder = await User.findById(actualFounderId);
  const trainer = await User.findById(actualTrainerId);
  if (founder?.notifyEmail) emailSvc.sessionBooked(founder, trainer, session).catch(() => {});

  return ok(res, { session }, 'Session booked', 201);
}));

// ── Update session status ──────────────────────────────────
router.patch('/:id', protect, catchAsync(async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session) return fail(res, 'Session not found', 404);

  const isOwner = session.trainer.toString() === req.user._id.toString()
                || session.founder.toString() === req.user._id.toString()
                || req.user.role === 'admin';
  if (!isOwner) return fail(res, 'Access denied', 403);

  const updatable = ['status','notes','prepNote','calendarUrl','recording'];
  updatable.forEach(f => { if (req.body[f] !== undefined) session[f] = req.body[f]; });
  await session.save();

  ws.emitSessionUpdate(session, [session.founder.toString(), session.trainer.toString()]);

  return ok(res, { session }, 'Session updated');
}));

// ── Add post-session feedback (trainer) ───────────────────
router.post('/:id/feedback', protect, requireTrainer, catchAsync(async (req, res) => {
  const session = await Session.findById(req.params.id).populate('founder', 'name email notifyEmail').populate('trainer', 'name email');
  if (!session) return fail(res, 'Session not found', 404);
  if (session.trainer._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return fail(res, 'Only the session trainer can add feedback', 403);
  }

  session.feedback = {
    wentWell: req.body.wentWell,
    improve:  req.body.improve,
    actions:  req.body.actions,
    rating:   req.body.rating,
    sentAt:   new Date(),
  };
  if (req.body.trainerNotes) session.trainerNotes = req.body.trainerNotes;
  session.status = 'completed';
  await session.save();

  // Notify founder
  if (session.founder.notifyEmail) {
    emailSvc.sessionFeedback(session.founder, session.trainer, session.feedback, session.type).catch(() => {});
  }

  // In-app notification
  await Notification.create({
    user:  session.founder._id,
    type:  'feedback_received',
    title: 'Session feedback received',
    body:  `${session.trainer.name} has shared feedback from your ${session.type} session`,
    link:  '/feedback',
  });
  ws.emitNotification(session.founder._id, { title: 'Feedback received', body: 'Check your session feedback' });

  return ok(res, { session }, 'Feedback saved and sent to founder');
}));

// ── Cancel session ─────────────────────────────────────────
router.delete('/:id', protect, catchAsync(async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session) return fail(res, 'Session not found', 404);
  session.status = 'cancelled';
  await session.save();
  ws.emitSessionUpdate(session, [session.founder.toString(), session.trainer.toString()]);
  return ok(res, {}, 'Session cancelled');
}));

module.exports = router;

// ═══════════════════════════════════════════════════════════
// MESSAGES ROUTER
// ═══════════════════════════════════════════════════════════
const msgRouter = express.Router();
const { Message } = require('../models');
const { v4: uuidv4 } = require('uuid');

// ── Get inbox ──────────────────────────────────────────────
msgRouter.get('/', protect, catchAsync(async (req, res) => {
  const msgs = await Message.find({
    $or: [{ to: req.user._id }, { from: req.user._id }],
    deleted: false,
  })
  .populate('from', 'name avatar role')
  .populate('to',   'name avatar role')
  .sort({ createdAt: -1 })
  .limit(100);
  return ok(res, { messages: msgs });
}));

// ── Get thread ─────────────────────────────────────────────
msgRouter.get('/thread/:threadId', protect, catchAsync(async (req, res) => {
  const msgs = await Message.find({ threadId: req.params.threadId, deleted: false })
    .populate('from', 'name avatar role')
    .populate('to',   'name avatar role')
    .sort({ createdAt: 1 });
  // Mark as read
  await Message.updateMany(
    { threadId: req.params.threadId, to: req.user._id, readBy: { $ne: req.user._id } },
    { $push: { readBy: req.user._id }, $set: { readAt: new Date() } }
  );
  return ok(res, { messages: msgs });
}));

// ── Send message ───────────────────────────────────────────
msgRouter.post('/', protect, catchAsync(async (req, res) => {
  const { toId, subject, body, type, parentId } = req.body;
  if (!toId || !body) return fail(res, 'toId and body are required');

  const recipient = await User.findById(toId);
  if (!recipient) return fail(res, 'Recipient not found', 404);

  // Thread management
  let threadId = req.body.threadId;
  if (parentId && !threadId) {
    const parent = await Message.findById(parentId);
    threadId = parent?.threadId || parentId.toString();
  }
  if (!threadId) threadId = uuidv4();

  const msg = await Message.create({
    from: req.user._id, to: toId,
    subject, body, type: type || 'direct',
    threadId, parentId,
  });
  await msg.populate('from', 'name avatar role');
  await msg.populate('to',   'name avatar role');

  // Real-time delivery
  ws.emitNewMessage(msg, toId);

  // In-app notification
  await Notification.create({
    user:  toId,
    type:  'new_message',
    title: `New message from ${req.user.name}`,
    body:  body.slice(0, 80),
    link:  '/messages',
  });

  return ok(res, { message: msg }, 'Message sent', 201);
}));

// ── Mark read ──────────────────────────────────────────────
msgRouter.patch('/:id/read', protect, catchAsync(async (req, res) => {
  await Message.findOneAndUpdate(
    { _id: req.params.id, to: req.user._id },
    { $addToSet: { readBy: req.user._id }, readAt: new Date() }
  );
  return ok(res, {}, 'Marked as read');
}));

// ── Unread count ───────────────────────────────────────────
msgRouter.get('/unread-count', protect, catchAsync(async (req, res) => {
  const count = await Message.countDocuments({ to: req.user._id, readBy: { $ne: req.user._id }, deleted: false });
  return ok(res, { count });
}));

// ── Delete ─────────────────────────────────────────────────
msgRouter.delete('/:id', protect, catchAsync(async (req, res) => {
  await Message.findOneAndUpdate(
    { _id: req.params.id, $or: [{ from: req.user._id }, { to: req.user._id }] },
    { deleted: true }
  );
  return ok(res, {}, 'Message deleted');
}));

// ═══════════════════════════════════════════════════════════
// COHORTS ROUTER
// ═══════════════════════════════════════════════════════════
const cohortRouter = express.Router();
const { Cohort, Programme: ProgrammeModel } = require('../models');

cohortRouter.get('/', protect, catchAsync(async (req, res) => {
  const { user } = req;
  let filter = {};
  if (user.role === 'trainer') filter = { trainers: user._id };
  if (user.role === 'founder') filter = { founders: user._id };
  const cohorts = await Cohort.find(filter)
    .populate('founders', 'name email avatar status lastActive businessName city')
    .populate('trainers', 'name email avatar specialty mentorRole sessionsCount rating');
  return ok(res, { cohorts });
}));

cohortRouter.post('/', protect, catchAsync(async (req, res) => {
  if (!['admin','trainer'].includes(req.user.role)) return fail(res, 'Access denied', 403);
  const { name, description, startDate, endDate, capacity } = req.body;
  if (!name) return fail(res, 'Cohort name required');
  const cohort = await Cohort.create({ name, description, startDate, endDate, capacity: capacity || 12, createdBy: req.user._id });
  return ok(res, { cohort }, 'Cohort created', 201);
}));

cohortRouter.patch('/:id', protect, catchAsync(async (req, res) => {
  if (req.user.role !== 'admin') return fail(res, 'Admin only', 403);
  const updatable = ['name','description','startDate','endDate','status','capacity','currentStage'];
  const updates = {};
  updatable.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
  const cohort = await Cohort.findByIdAndUpdate(req.params.id, updates, { new: true });
  if (!cohort) return fail(res, 'Cohort not found', 404);
  return ok(res, { cohort }, 'Cohort updated');
}));

// ── Assign founder to cohort ──────────────────────────────
cohortRouter.post('/:id/founders', protect, catchAsync(async (req, res) => {
  if (!['admin','trainer'].includes(req.user.role)) return fail(res, 'Access denied', 403);
  const { founderId } = req.body;
  const cohort = await Cohort.findById(req.params.id);
  if (!cohort) return fail(res, 'Cohort not found', 404);
  if (cohort.founders.includes(founderId)) return fail(res, 'Founder already in this cohort');
  if (cohort.founders.length >= cohort.capacity) return fail(res, 'Cohort is at full capacity');
  cohort.founders.push(founderId);
  await cohort.save();
  await ProgrammeModel.findOneAndUpdate({ founder: founderId }, { cohort: cohort._id });
  ws.emitFounderProgress(founderId, null, { event: 'cohort_assigned', cohortId: cohort._id, cohortName: cohort.name });
  return ok(res, { cohort }, 'Founder assigned to cohort');
}));

// ── Remove founder ─────────────────────────────────────────
cohortRouter.delete('/:id/founders/:founderId', protect, catchAsync(async (req, res) => {
  if (req.user.role !== 'admin') return fail(res, 'Admin only', 403);
  const cohort = await Cohort.findByIdAndUpdate(req.params.id, { $pull: { founders: req.params.founderId } }, { new: true });
  if (!cohort) return fail(res, 'Cohort not found', 404);
  return ok(res, {}, 'Founder removed from cohort');
}));

// ── Assign trainer ─────────────────────────────────────────
cohortRouter.post('/:id/trainers', protect, catchAsync(async (req, res) => {
  if (req.user.role !== 'admin') return fail(res, 'Admin only', 403);
  const { trainerId } = req.body;
  const [cohort, trainer] = await Promise.all([Cohort.findById(req.params.id), User.findById(trainerId)]);
  if (!cohort)   return fail(res, 'Cohort not found', 404);
  if (!trainer)  return fail(res, 'Trainer not found', 404);
  if (cohort.trainers.includes(trainerId)) return fail(res, 'Trainer already in this cohort');
  cohort.trainers.push(trainerId);
  await cohort.save();
  emailSvc.notification(trainer.email, 'You have been assigned to ' + cohort.name, 'Cohort Assignment', `You have been assigned as a trainer for cohort: ${cohort.name}`, 'Open Trainer Portal', process.env.FRONTEND_URL + '/trainer').catch(() => {});
  return ok(res, { cohort }, 'Trainer assigned to cohort');
}));

// ── Assign trainer to individual founder ──────────────────
cohortRouter.post('/assign-trainer', protect, catchAsync(async (req, res) => {
  if (!['admin'].includes(req.user.role)) return fail(res, 'Admin only', 403);
  const { founderId, trainerId } = req.body;
  if (!founderId || !trainerId) return fail(res, 'founderId and trainerId required');
  await ProgrammeModel.findOneAndUpdate({ founder: founderId }, { assignedTrainer: trainerId });
  const [founder, trainer] = await Promise.all([User.findById(founderId), User.findById(trainerId)]);
  if (trainer?.notifyEmail) emailSvc.trainerFounderAssigned(trainer, founder).catch(() => {});
  ws.emitNotification(trainerId, { title: 'New founder assigned', body: `${founder.name} has been assigned to you` });
  return ok(res, {}, 'Trainer assigned to founder');
}));

// ── Broadcast message to cohort founders ─────────────────
cohortRouter.post('/:id/broadcast', protect, catchAsync(async (req, res) => {
  if (!['admin','trainer'].includes(req.user.role)) return fail(res, 'Access denied', 403);
  const cohort = await Cohort.findById(req.params.id).populate('founders', 'email name notifyEmail');
  if (!cohort) return fail(res, 'Cohort not found', 404);
  const { subject, body } = req.body;
  if (!subject || !body) return fail(res, 'Subject and body required');

  // Send in-app messages and emails
  const sends = cohort.founders.map(async (founder) => {
    await Message.create({ from: req.user._id, to: founder._id, subject, body, type: 'admin' });
    if (founder.notifyEmail) emailSvc.notification(founder.email, subject, subject, body, 'Open Platform', process.env.FRONTEND_URL).catch(() => {});
  });
  await Promise.allSettled(sends);

  ws.emitCohortAnnouncement(cohort.founders.map(f => f._id.toString()), { subject, body, from: req.user.name });
  return ok(res, { sent: cohort.founders.length }, `Broadcast sent to ${cohort.founders.length} founders`);
}));

// ═══════════════════════════════════════════════════════════
// USERS ROUTER (admin management)
// ═══════════════════════════════════════════════════════════
const usersRouter = express.Router();

usersRouter.get('/', protect, catchAsync(async (req, res) => {
  if (!['admin','trainer'].includes(req.user.role)) return fail(res, 'Access denied', 403);
  const { role, status, search, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (role)   filter.role   = role;
  if (status) filter.status = status;
  if (search) filter.$or = [
    { name:  { $regex: search, $options: 'i' } },
    { email: { $regex: search, $options: 'i' } },
    { businessName: { $regex: search, $options: 'i' } },
  ];
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page-1)*limit).limit(parseInt(limit)),
    User.countDocuments(filter),
  ]);
  return ok(res, { users: users.map(u => u.toSafe()), total, page: parseInt(page), pages: Math.ceil(total/limit) });
}));

usersRouter.get('/:id', protect, catchAsync(async (req, res) => {
  const { user: me } = req;
  if (me.role === 'founder' && me._id.toString() !== req.params.id) return fail(res, 'Access denied', 403);
  const user = await User.findById(req.params.id);
  if (!user) return fail(res, 'User not found', 404);
  return ok(res, { user: user.toSafe() });
}));

usersRouter.patch('/:id', protect, catchAsync(async (req, res) => {
  if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) return fail(res, 'Access denied', 403);
  const allowed = req.user.role === 'admin'
    ? ['name','phone','city','bio','status','specialty','mentorRole','businessName','businessType','niche','notifyEmail','notifyInApp']
    : ['name','phone','city','bio','businessName','businessType','niche','notifyEmail','notifyInApp'];
  const updates = {};
  allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
  const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
  if (!user) return fail(res, 'User not found', 404);
  return ok(res, { user: user.toSafe() }, 'User updated');
}));

usersRouter.delete('/:id', protect, catchAsync(async (req, res) => {
  if (req.user.role !== 'admin') return fail(res, 'Admin only', 403);
  await User.findByIdAndUpdate(req.params.id, { status: 'inactive' });
  return ok(res, {}, 'User deactivated');
}));

// ── Activity feed for a user ──────────────────────────────
usersRouter.get('/:id/activity', protect, catchAsync(async (req, res) => {
  if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) return fail(res, 'Access denied', 403);
  const activities = await Activity.find({ user: req.params.id }).sort({ createdAt: -1 }).limit(50);
  return ok(res, { activities });
}));

// ═══════════════════════════════════════════════════════════
// REPORTS ROUTER
// ═══════════════════════════════════════════════════════════
const reportsRouter = express.Router();
const { TrainerFeedback } = require('../models');

// ── Admin: programme analytics ────────────────────────────
reportsRouter.get('/programme', protect, catchAsync(async (req, res) => {
  if (!['admin','trainer'].includes(req.user.role)) return fail(res, 'Access denied', 403);

  const [founders, trainers, cohorts, sessions, programmes] = await Promise.all([
    User.countDocuments({ role: 'founder' }),
    User.countDocuments({ role: 'trainer' }),
    Cohort.countDocuments(),
    Session.countDocuments(),
    ProgrammeModel.find().select('stage assessments survey.responses bmc flags'),
  ]);

  const avgStage        = programmes.reduce((a,p) => a + p.stage, 0) / (programmes.length || 1);
  const avgBMC          = programmes.reduce((a,p) => a + p.bmc.size, 0) / (programmes.length || 1);
  const avgSurveyResps  = programmes.reduce((a,p) => a + (p.survey?.responses?.length || 0), 0) / (programmes.length || 1);
  const validated       = programmes.filter(p => (p.survey?.responses?.length || 0) >= 30).length;
  const atRisk          = programmes.filter(p => p.flags?.some(f => !f.resolved)).length;

  const stageDistribution = {};
  programmes.forEach(p => { stageDistribution[p.stage] = (stageDistribution[p.stage] || 0) + 1; });

  return ok(res, {
    totals: { founders, trainers, cohorts, sessions },
    averages: {
      stage:   parseFloat(avgStage.toFixed(1)),
      bmcSteps: parseFloat(avgBMC.toFixed(1)),
      surveyResponses: parseFloat(avgSurveyResps.toFixed(1)),
    },
    validated, atRisk,
    stageDistribution,
    totalProgrammes: programmes.length,
  });
}));

// ── Trainer: save feedback ────────────────────────────────
reportsRouter.post('/trainer-feedback', protect, requireTrainer, catchAsync(async (req, res) => {
  const { founderId, sessionId, type, wentWell, improve, actions, rating, notes, scores } = req.body;
  if (!founderId) return fail(res, 'founderId required');
  const fb = await TrainerFeedback.create({
    trainer: req.user._id, founder: founderId, session: sessionId,
    type: type || 'session', wentWell, improve, actions, rating, notes, scores,
  });
  return ok(res, { feedback: fb }, 'Feedback saved', 201);
}));

// ── Get feedback for a founder ────────────────────────────
reportsRouter.get('/trainer-feedback/:founderId', protect, catchAsync(async (req, res) => {
  const { user } = req;
  if (user.role === 'founder' && user._id.toString() !== req.params.founderId) return fail(res, 'Access denied', 403);
  const query = { founder: req.params.founderId };
  if (user.role === 'trainer') query.trainer = user._id;
  const feedbacks = await TrainerFeedback.find(query)
    .populate('trainer', 'name avatar')
    .populate('session', 'type date')
    .sort({ createdAt: -1 });
  return ok(res, { feedbacks });
}));

// ── Programme export (admin) ──────────────────────────────
reportsRouter.get('/export/:founderId', protect, catchAsync(async (req, res) => {
  if (req.user.role === 'founder' && req.user._id.toString() !== req.params.founderId) return fail(res, 'Access denied', 403);
  const [prog, user] = await Promise.all([
    ProgrammeModel.findOne({ founder: req.params.founderId })
      .populate('founder', 'name email city businessName')
      .populate('assignedTrainer', 'name email'),
    User.findById(req.params.founderId),
  ]);
  if (!prog) return fail(res, 'Programme not found', 404);
  return ok(res, { programme: prog, user: user?.toSafe() });
}));

module.exports = { sessionsRouter: router, msgRouter, cohortRouter, usersRouter, reportsRouter };
