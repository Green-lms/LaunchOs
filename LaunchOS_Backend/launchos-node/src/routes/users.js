const router = require('express').Router();
const User   = require('../models/User');
const { auth, roles } = require('../middleware/auth');

// GET /api/users — admin: all users; trainer: their founders; founder: just themselves
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'admin') {
      const { role, status, cohort } = req.query;
      if (role)   query.role   = role;
      if (status) query.status = status;
      if (cohort) query['founderProfile.cohortId'] = cohort;
    } else if (req.user.role === 'trainer') {
      query = { $or: [{ 'founderProfile.assignedTrainer': req.user._id }, { 'founderProfile.assignedMentor': req.user._id }], role: 'founder' };
    } else {
      return res.json({ users: [req.user] });
    }
    const users = await User.find(query).select('-password -refreshTokens -resetToken -resetExpiry').sort({ createdAt: -1 });
    res.json({ users });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/users/:id
router.get('/:id', auth, async (req, res) => {
  try {
    if (req.user.role === 'founder' && String(req.user._id) !== req.params.id)
      return res.status(403).json({ error: 'Access denied' });
    const user = await User.findById(req.params.id).select('-password -refreshTokens -resetToken -resetExpiry');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/users/:id — update profile
router.put('/:id', auth, async (req, res) => {
  try {
    if (req.user.role === 'founder' && String(req.user._id) !== req.params.id)
      return res.status(403).json({ error: 'Access denied' });
    const allowed = ['name','phone','city','avatar','founderProfile','trainerProfile'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    // Admin-only fields
    if (req.user.role === 'admin') {
      if (req.body.status !== undefined) updates.status = req.body.status;
      if (req.body.role   !== undefined) updates.role   = req.body.role;
    }
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password -refreshTokens -resetToken -resetExpiry');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/users/:id/assign-trainer — admin assigns trainer/mentor to founder
router.post('/:id/assign-trainer', auth, roles('admin'), async (req, res) => {
  try {
    const { trainerId, mentorId } = req.body;
    const updates = {};
    if (trainerId) updates['founderProfile.assignedTrainer'] = trainerId;
    if (mentorId)  updates['founderProfile.assignedMentor']  = mentorId;
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password -refreshTokens');
    if (!user) return res.status(404).json({ error: 'Founder not found' });

    // Add founder to trainer's cohort list if needed
    if (trainerId) await User.findByIdAndUpdate(trainerId, { $addToSet: { 'trainerProfile.cohorts': user.founderProfile?.cohortId } });

    res.json({ user, message: 'Trainer/mentor assigned' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/users/:id/stage — update founder stage (trainer or admin)
router.put('/:id/stage', auth, roles('admin','trainer'), async (req, res) => {
  try {
    const { stage } = req.body;
    if (stage === undefined || stage < 0 || stage > 9)
      return res.status(400).json({ error: 'stage must be 0-9' });
    const user = await User.findByIdAndUpdate(req.params.id, { 'founderProfile.stage': stage }, { new: true }).select('-password -refreshTokens');
    if (!user) return res.status(404).json({ error: 'Founder not found' });
    res.json({ user, message: 'Stage updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/users/:id — admin only
router.delete('/:id', auth, roles('admin'), async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;