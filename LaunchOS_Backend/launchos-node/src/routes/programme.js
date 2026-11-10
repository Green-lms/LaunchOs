const router = require('express').Router();
const Programme = require('../models/Programme');
const { auth, roles, trainerOwnsFounder } = require('../middleware/auth');

// GET /api/programme/:founderId — get full programme
router.get('/:founderId', auth, trainerOwnsFounder, async (req, res) => {
  try {
    let prog = await Programme.findOne({ founderId: req.params.founderId });
    if (!prog) prog = await Programme.create({ founderId: req.params.founderId });
    res.json({ programme: prog });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/programme/:founderId/bmc — save BMC step
router.put('/:founderId/bmc', auth, trainerOwnsFounder, async (req, res) => {
  try {
    const { stepIndex, content } = req.body;
    if (stepIndex === undefined || stepIndex < 0 || stepIndex > 15)
      return res.status(400).json({ error: 'stepIndex 0-15 required' });
    const prog = await Programme.findOne({ founderId: req.params.founderId });
    if (!prog) return res.status(404).json({ error: 'Programme not found' });
    const existing = prog.bmc.steps.find(s => s.stepIndex === stepIndex);
    if (existing) { existing.content = content; existing.updatedAt = new Date(); }
    else prog.bmc.steps.push({ stepIndex, content });
    prog.bmc.lastUpdated = new Date();
    await prog.save();
    res.json({ step: { stepIndex, content }, bmc: prog.bmc });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/programme/:founderId/bmc/:stepIndex/trainer-note — trainer scores/notes a BMC step
router.put('/:founderId/bmc/:stepIndex/trainer-note', auth, roles('trainer','admin'), async (req, res) => {
  try {
    const { note, score } = req.body;
    const si = parseInt(req.params.stepIndex);
    const prog = await Programme.findOne({ founderId: req.params.founderId });
    if (!prog) return res.status(404).json({ error: 'Programme not found' });
    const step = prog.bmc.steps.find(s => s.stepIndex === si);
    if (!step) return res.status(404).json({ error: 'Step not found' });
    if (note  !== undefined) step.trainerNote  = note;
    if (score !== undefined) step.trainerScore = score;
    await prog.save();
    res.json({ step });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/programme/:founderId/offer
router.put('/:founderId/offer', auth, trainerOwnsFounder, async (req, res) => {
  try {
    const prog = await Programme.findOneAndUpdate(
      { founderId: req.params.founderId },
      { $set: { offer: { ...req.body, lastUpdated: new Date() } } },
      { new: true, upsert: true }
    );
    res.json({ offer: prog.offer });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/programme/:founderId/assessments
router.put('/:founderId/assessments', auth, trainerOwnsFounder, async (req, res) => {
  try {
    const { type, score, answers } = req.body;
    const prog = await Programme.findOne({ founderId: req.params.founderId });
    if (!prog) return res.status(404).json({ error: 'Programme not found' });
    const existing = prog.assessments.find(a => a.type === type);
    if (existing) { existing.score = score; existing.answers = answers; existing.completedAt = new Date(); }
    else prog.assessments.push({ type, score, answers });
    await prog.save();
    res.json({ assessments: prog.assessments });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET/PUT /api/programme/:founderId/survey — survey questions
router.get('/:founderId/survey', auth, trainerOwnsFounder, async (req, res) => {
  try {
    const prog = await Programme.findOne({ founderId: req.params.founderId });
    res.json({ survey: prog?.survey || {} });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:founderId/survey', auth, trainerOwnsFounder, async (req, res) => {
  try {
    const { title, description, targetGroup, goal, questions } = req.body;
    const prog = await Programme.findOneAndUpdate(
      { founderId: req.params.founderId },
      { $set: { 'survey.title': title, 'survey.description': description, 'survey.targetGroup': targetGroup, 'survey.goal': goal, 'survey.questions': questions, 'survey.lastUpdated': new Date() } },
      { new: true, upsert: true }
    );
    res.json({ survey: prog.survey });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/programme/:founderId/survey/response — submit a survey response
// Public-ish: no auth required (respondents are external)
router.post('/:founderId/survey/response', async (req, res) => {
  try {
    const { answers, source = 'direct' } = req.body;
    if (!answers) return res.status(400).json({ error: 'answers required' });
    const prog = await Programme.findOne({ founderId: req.params.founderId });
    if (!prog) return res.status(404).json({ error: 'Survey not found' });
    prog.survey.responses.push({ answers, source, submittedAt: new Date() });
    prog.survey.lastUpdated = new Date();
    await prog.save();
    res.json({ message: 'Response submitted', total: prog.survey.responses.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/programme/:founderId/survey/analysis
router.put('/:founderId/survey/analysis', auth, trainerOwnsFounder, async (req, res) => {
  try {
    const { analysis } = req.body;
    await Programme.findOneAndUpdate({ founderId: req.params.founderId }, { 'survey.analysis': analysis, 'survey.lastUpdated': new Date() });
    res.json({ message: 'Analysis saved' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/programme/:founderId/scripts — save/update a script
router.put('/:founderId/scripts', auth, trainerOwnsFounder, async (req, res) => {
  try {
    const { type, content, aiGenerated } = req.body;
    if (!type) return res.status(400).json({ error: 'type required' });
    const prog = await Programme.findOne({ founderId: req.params.founderId });
    if (!prog) return res.status(404).json({ error: 'Programme not found' });
    const existing = prog.scripts.find(s => s.type === type);
    if (existing) { existing.content = content; existing.aiGenerated = aiGenerated; existing.generatedAt = new Date(); }
    else prog.scripts.push({ type, content, aiGenerated, generatedAt: new Date() });
    await prog.save();
    res.json({ scripts: prog.scripts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/programme/:founderId/capital
router.put('/:founderId/capital', auth, trainerOwnsFounder, async (req, res) => {
  try {
    const prog = await Programme.findOneAndUpdate(
      { founderId: req.params.founderId },
      { $set: { capital: { ...req.body, lastUpdated: new Date() } } },
      { new: true, upsert: true }
    );
    res.json({ capital: prog.capital });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/programme/:founderId/competitor
router.put('/:founderId/competitor', auth, trainerOwnsFounder, async (req, res) => {
  try {
    const prog = await Programme.findOneAndUpdate(
      { founderId: req.params.founderId },
      { $set: { competitor: { ...req.body, lastUpdated: new Date() } } },
      { new: true, upsert: true }
    );
    res.json({ competitor: prog.competitor });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/programme/:founderId/mvp
router.put('/:founderId/mvp', auth, trainerOwnsFounder, async (req, res) => {
  try {
    const prog = await Programme.findOneAndUpdate(
      { founderId: req.params.founderId },
      { $set: { mvp: { ...req.body, lastUpdated: new Date() } } },
      { new: true, upsert: true }
    );
    res.json({ mvp: prog.mvp });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/programme/:founderId/trainer-feedback
router.post('/:founderId/trainer-feedback', auth, roles('trainer','admin'), async (req, res) => {
  try {
    const { module, wentWell, improve, actions, rating, sessionId } = req.body;
    const prog = await Programme.findOne({ founderId: req.params.founderId });
    if (!prog) return res.status(404).json({ error: 'Programme not found' });
    prog.trainerFeedback.push({ module, trainerId: req.user._id, wentWell, improve, actions, rating, sessionId });
    await prog.save();
    res.json({ feedback: prog.trainerFeedback });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/programme/:founderId/trainer-feedback — founder sees their own feedback
router.get('/:founderId/trainer-feedback', auth, trainerOwnsFounder, async (req, res) => {
  try {
    const prog = await Programme.findOne({ founderId: req.params.founderId }).populate('trainerFeedback.trainerId','name avatar role');
    res.json({ feedback: prog?.trainerFeedback || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/programme/:founderId/trainer-notes — private trainer notes
router.post('/:founderId/trainer-notes', auth, roles('trainer','admin'), async (req, res) => {
  try {
    const { note, isFlag } = req.body;
    const prog = await Programme.findOne({ founderId: req.params.founderId });
    if (!prog) return res.status(404).json({ error: 'Programme not found' });
    const existing = prog.trainerNotes.find(n => String(n.trainerId) === String(req.user._id));
    if (existing) { existing.note = note; existing.isFlag = isFlag; existing.updatedAt = new Date(); }
    else prog.trainerNotes.push({ trainerId: req.user._id, note, isFlag });
    await prog.save();
    res.json({ message: 'Notes saved' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;