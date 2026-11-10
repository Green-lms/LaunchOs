const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Identity
  name:        { type: String, required: true, trim: true },
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:    { type: String, required: true, minlength: 8 },
  role:        { type: String, enum: ['founder','trainer','admin'], required: true },
  avatar:      { type: String, default: '' },   // initials e.g. "AS"
  phone:       { type: String, default: '' },
  city:        { type: String, default: '' },

  // Status
  status:      { type: String, enum: ['active','inactive','onboarding','suspended'], default: 'onboarding' },
  emailVerified:{ type: Boolean, default: false },
  lastLogin:   { type: Date },
  lastActive:  { type: Date },

  // Founder-specific
  founderProfile: {
    businessName:   { type: String, default: '' },
    businessType:   { type: String, default: '' },   // SaaS / D2C / Service / EdTech etc.
    industry:       { type: String, default: '' },
    stage:          { type: Number, default: 0, min: 0, max: 9 },
    cohortId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Cohort', default: null },
    assignedTrainer:{ type: mongoose.Schema.Types.ObjectId, ref: 'User',   default: null },
    assignedMentor: { type: mongoose.Schema.Types.ObjectId, ref: 'User',   default: null },
    enrolledAt:     { type: Date },
    graduatedAt:    { type: Date },
  },

  // Trainer/Mentor-specific
  trainerProfile: {
    specialty:   { type: String, default: '' },
    bio:         { type: String, default: '' },
    role:        { type: String, enum: ['trainer','mentor','both'], default: 'trainer' },
    rating:      { type: Number, default: null, min: 0, max: 5 },
    totalSessions:{ type: Number, default: 0 },
    cohorts:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Cohort' }],
    joinDate:    { type: Date, default: Date.now },
  },

  // Auth tokens
  refreshTokens: [{ token: String, createdAt: { type: Date, default: Date.now } }],
  resetToken:    { type: String, default: null },
  resetExpiry:   { type: Date,   default: null },

}, { timestamps: true });

// Hash password before save
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Auto-generate avatar initials
userSchema.pre('save', function(next) {
  if (!this.avatar && this.name) {
    this.avatar = this.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }
  next();
});

userSchema.methods.comparePassword = async function(plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toSafe = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshTokens;
  delete obj.resetToken;
  delete obj.resetExpiry;
  return obj;
};

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ 'founderProfile.cohortId': 1 });

module.exports = mongoose.model('User', userSchema);
