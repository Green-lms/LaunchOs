const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const Programme = require('../models/Programme');
const { auth } = require('../middleware/auth');

const signToken   = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET,         { expiresIn: process.env.JWT_EXPIRES_IN     || '24h' });
const signRefresh = (id)       => jwt.sign({ id },       process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' });

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role = 'founder', city, phone, businessName, businessType, specialty, adminKey } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password min 8 chars' });
    if (!['founder','trainer','admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (role !== 'founder' && (!process.env.ADMIN_INVITE_KEY || adminKey !== process.env.ADMIN_INVITE_KEY))
      return res.status(403).json({ error: 'Admin key required for trainer/admin registration' });
    if (await User.findOne({ email })) return res.status(409).json({ error: 'Email already registered' });

    const ud = { name, email, password, role, city, phone, status: 'onboarding' };
    if (role === 'founder' && businessName) ud.founderProfile = { businessName, businessType, enrolledAt: new Date() };
    if ((role === 'trainer') && specialty)  ud.trainerProfile = { specialty };

    const user = await User.create(ud);
    if (role === 'founder') await Programme.create({ founderId: user._id });

    const token = signToken(user._id, user.role), refresh = signRefresh(user._id);
    await User.findByIdAndUpdate(user._id, { $push: { refreshTokens: { token: refresh } }, lastLogin: new Date() });
    res.status(201).json({ token, refresh, user: user.toSafe() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.status === 'suspended') return res.status(403).json({ error: 'Account suspended' });
    const token = signToken(user._id, user.role), refresh = signRefresh(user._id);
    await User.findByIdAndUpdate(user._id, { $push: { refreshTokens: { token: refresh } }, lastLogin: new Date(), lastActive: new Date() });
    res.json({ token, refresh, user: user.toSafe() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refresh } = req.body;
    if (!refresh) return res.status(400).json({ error: 'Refresh token required' });
    const decoded = jwt.verify(refresh, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || !user.refreshTokens.some(t => t.token === refresh))
      return res.status(401).json({ error: 'Invalid refresh token' });
    const newToken = signToken(user._id, user.role), newRefresh = signRefresh(user._id);
    await User.findByIdAndUpdate(user._id, { $pull: { refreshTokens: { token: refresh } }, $push: { refreshTokens: { token: newRefresh } } });
    res.json({ token: newToken, refresh: newRefresh });
  } catch (err) { res.status(401).json({ error: 'Invalid or expired refresh token' }); }
});

// POST /api/auth/logout
router.post('/logout', auth, async (req, res) => {
  const { refresh } = req.body;
  await User.findByIdAndUpdate(req.user._id, { $pull: { refreshTokens: { token: refresh } } });
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => res.json({ user: req.user }));

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (user) {
      const token = require('crypto').randomBytes(32).toString('hex');
      await User.findByIdAndUpdate(user._id, { resetToken: token, resetExpiry: new Date(Date.now() + 3600000) });
    }
    res.json({ message: 'If that email exists, a reset link was sent' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password || password.length < 8) return res.status(400).json({ error: 'Valid token and password required' });
    const user = await User.findOne({ resetToken: token, resetExpiry: { $gt: new Date() } });
    if (!user) return res.status(400).json({ error: 'Invalid or expired token' });
    user.password = password; user.resetToken = null; user.resetExpiry = null;
    await user.save();
    res.json({ message: 'Password reset successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;