const router = require('express').Router();
const { Cohort } = require('../models/Cohort');
const User   = require('../models/User');
const Programme = require('../models/Programme');
const { auth, roles } = require('../middleware/auth');

// GET /api/cohorts
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'trainer') query = { trainers: req.user._id };
    if (req.user.role === 'founder') query = { founders: req.user._id };
    const cohorts = await Cohort.find(query)
      .populate('founders', 'name avatar founderProfile')
      .populate('trainers', 'name avatar trainerProfile')
      .sort({ createdAt: -1 });
    res.json({ cohorts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cohorts — admin creates cohort
router.post('/', auth, roles('admin'), async (req, res) => {
  try {
    const { name, description, startDate, endDate, capacity, totalWeeks } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const cohort = await Cohort.create({ name, description, startDate, endDate, capacity, totalWeeks: totalWeeks || 18, createdBy: req.user._id });
    res.status(201).json({ cohort });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/cohorts/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const cohort = await Cohort.findById(req.params.id)
      .populate('founders', 'name avatar city founderProfile status')
      .populate('trainers', 'name avatar trainerProfile');
    if (!cohort) return res.status(404).json({ error: 'Cohort not found' });
    res.json({ cohort });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/cohorts/:id
router.put('/:id', auth, roles('admin'), async (req, res) => {
  try {
    const cohort = await Cohort.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ cohort });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cohorts/:id/add-founder
router.post('/:id/add-founder', auth, roles('admin'), async (req, res) => {
  try {
    const { founderId } = req.body;
    if (!founderId) return res.status(400).json({ error: 'founderId required' });
    const cohort = await Cohort.findByIdAndUpdate(req.params.id, { $addToSet: { founders: founderId } }, { new: true });
    await User.findByIdAndUpdate(founderId, { 'founderProfile.cohortId': req.params.id });
    res.json({ cohort, message: 'Founder added to cohort' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cohorts/:id/remove-founder
router.post('/:id/remove-founder', auth, roles('admin'), async (req, res) => {
  try {
    const { founderId } = req.body;
    const cohort = await Cohort.findByIdAndUpdate(req.params.id, { $pull: { founders: founderId } }, { new: true });
    await User.findByIdAndUpdate(founderId, { 'founderProfile.cohortId': null });
    res.json({ cohort, message: 'Founder removed from cohort' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cohorts/:id/add-trainer
router.post('/:id/add-trainer', auth, roles('admin'), async (req, res) => {
  try {
    const { trainerId } = req.body;
    if (!trainerId) return res.status(400).json({ error: 'trainerId required' });
    const cohort = await Cohort.findByIdAndUpdate(req.params.id, { $addToSet: { trainers: trainerId } }, { new: true });
    await User.findByIdAndUpdate(trainerId, { $addToSet: { 'trainerProfile.cohorts': req.params.id } });
    res.json({ cohort, message: 'Trainer added to cohort' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/cohorts/:id/progress — cohort-level progress overview
router.get('/:id/progress', auth, async (req, res) => {
  try {
    const cohort = await Cohort.findById(req.params.id).populate('founders','name avatar founderProfile');
    if (!cohort) return res.status(404).json({ error: 'Cohort not found' });
    const programmes = await Programme.find({ founderId: { $in: cohort.founders.map(f=>f._id) } });
    const summary = cohort.founders.map(f => {
      const p = programmes.find(pr => String(pr.founderId) === String(f._id));
      return {
        founder: { id: f._id, name: f.name, avatar: f.avatar, stage: f.founderProfile?.stage || 0 },
        bmcPct:     p ? Math.round((p.bmc.steps.filter(s=>s.content?.trim()).length / 16) * 100) : 0,
        surveyResp: p ? p.survey.responses.length : 0,
        scripts:    p ? p.scripts.length : 0,
      };
    });
    res.json({ cohort, summary });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;