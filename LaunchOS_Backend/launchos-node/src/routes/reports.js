const router = require('express').Router();
const User   = require('../models/User');
const Programme = require('../models/Programme');
const { Session, Message, Cohort } = require('../models/Cohort');
const { auth, roles } = require('../middleware/auth');

// GET /api/reports/dashboard — admin top-level dashboard stats
router.get('/dashboard', auth, roles('admin'), async (req, res) => {
  try {
    const [totalFounders, activeFounders, totalTrainers, totalSessions, pendingSessions, unreadMsgs] = await Promise.all([
      User.countDocuments({ role: 'founder' }),
      User.countDocuments({ role: 'founder', status: 'active' }),
      User.countDocuments({ role: { $in: ['trainer','admin'] } }),
      Session.countDocuments(),
      Session.countDocuments({ status: 'pending' }),
      Message.countDocuments({ read: false }),
    ]);

    const atRisk = await User.find({ role:'founder', status:'active' }, '_id');
    const progs  = await Programme.find({ founderId: { $in: atRisk.map(f=>f._id) } }, 'founderId survey.responses bmc.steps');
    const atRiskCount = progs.filter(p => p.survey.responses.length < 30 || p.bmc.steps.filter(s=>s.content?.trim()).length < 8).length;

    const stageDistribution = await User.aggregate([
      { $match: { role: 'founder' } },
      { $group: { _id: '$founderProfile.stage', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({ totalFounders, activeFounders, totalTrainers, totalSessions, pendingSessions, unreadMsgs, atRiskCount, stageDistribution });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/founders — full founder list with programme data
router.get('/founders', auth, roles('admin','trainer'), async (req, res) => {
  try {
    const founders = await User.find({ role: 'founder' }).select('-password -refreshTokens').sort({ createdAt: -1 });
    const programmes = await Programme.find({ founderId: { $in: founders.map(f=>f._id) } });
    const progMap = {};
    programmes.forEach(p => { progMap[String(p.founderId)] = p; });

    const report = founders.map(f => {
      const p = progMap[String(f._id)];
      return {
        id:          f._id,
        name:        f.name,
        email:       f.email,
        city:        f.city,
        avatar:      f.avatar,
        business:    f.founderProfile?.businessName,
        stage:       f.founderProfile?.stage || 0,
        status:      f.status,
        lastActive:  f.lastActive,
        bmcPct:      p ? Math.round((p.bmc.steps.filter(s=>s.content?.trim()).length/16)*100) : 0,
        surveyResp:  p ? p.survey.responses.length : 0,
        scriptsCount:p ? p.scripts.length : 0,
        assessAvg:   p && p.assessments.length ? Math.round(p.assessments.reduce((a,b)=>a+b.score,0)/p.assessments.length) : null,
      };
    });

    res.json({ founders: report });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/trainers
router.get('/trainers', auth, roles('admin'), async (req, res) => {
  try {
    const trainers = await User.find({ role: { $in: ['trainer'] } }).select('-password -refreshTokens');
    const sessionCounts = await Session.aggregate([
      { $group: { _id: '$trainerId', count: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq:['$status','completed'] }, 1, 0] } } } }
    ]);
    const scMap = {};
    sessionCounts.forEach(s => { scMap[String(s._id)] = s; });

    const report = trainers.map(t => ({
      id:         t._id,
      name:       t.name,
      email:      t.email,
      city:       t.city,
      avatar:     t.avatar,
      role:       t.trainerProfile?.role || t.role,
      specialty:  t.trainerProfile?.specialty,
      status:     t.status,
      cohorts:    t.trainerProfile?.cohorts?.length || 0,
      sessions:   scMap[String(t._id)]?.count || 0,
      completed:  scMap[String(t._id)]?.completed || 0,
      rating:     t.trainerProfile?.rating,
      joinDate:   t.trainerProfile?.joinDate,
    }));

    res.json({ trainers: report });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/cohorts
router.get('/cohorts', auth, roles('admin'), async (req, res) => {
  try {
    const cohorts = await Cohort.find().populate('founders','name').populate('trainers','name');
    const report = cohorts.map(c => ({
      id:       c._id,
      name:     c.name,
      status:   c.status,
      founders: c.founders.length,
      capacity: c.capacity,
      trainers: c.trainers.map(t=>t.name).join(', ') || '—',
      startDate:c.startDate,
      endDate:  c.endDate,
      week:     c.currentWeek,
      totalWeeks:c.totalWeeks,
    }));
    res.json({ cohorts: report });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;