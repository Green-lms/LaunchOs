const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer '))
      return res.status(401).json({ error: 'No token provided' });
    const token = header.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password -refreshTokens -resetToken -resetExpiry');
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.status === 'suspended') return res.status(403).json({ error: 'Account suspended' });
    User.findByIdAndUpdate(decoded.id, { lastActive: new Date() }).exec();
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const roles = (...allowedRoles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient role' });
  next();
};

const ownsFounder = (paramKey = 'founderId') => async (req, res, next) => {
  if (req.user.role === 'admin' || req.user.role === 'trainer') return next();
  const targetId = req.params[paramKey] || req.body[paramKey];
  if (String(req.user._id) !== String(targetId)) return res.status(403).json({ error: 'Access denied' });
  next();
};

const trainerOwnsFounder = async (req, res, next) => {
  if (req.user.role === 'admin') return next();
  if (req.user.role === 'founder') {
    if (String(req.user._id) !== String(req.params.founderId)) return res.status(403).json({ error: 'Access denied' });
    return next();
  }
  const founder = await User.findById(req.params.founderId);
  if (!founder) return res.status(404).json({ error: 'Founder not found' });
  const assigned = String(founder.founderProfile?.assignedTrainer) === String(req.user._id) ||
                   String(founder.founderProfile?.assignedMentor)  === String(req.user._id);
  if (!assigned) return res.status(403).json({ error: 'Founder not assigned to you' });
  next();
};

module.exports = { auth, roles, ownsFounder, trainerOwnsFounder };
