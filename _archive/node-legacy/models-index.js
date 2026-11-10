// ═══════════════════════════════════════════════════════════
// LaunchOS™ — All MongoDB Models
// Roles: founder (startup founder/student), trainer, admin
// ═══════════════════════════════════════════════════════════

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

// ── User (all roles) ───────────────────────────────────────
const UserSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  email:        { type: String, required: true, unique: true, lowercase: true },
  password:     { type: String, required: true, minlength: 8, select: false },
  role:         { type: String, enum: ['founder','trainer','admin'], default: 'founder' },
  avatar:       { type: String },           // initials e.g. "AS"
  phone:        { type: String },
  city:         { type: String },
  bio:          { type: String },
  specialty:    { type: String },           // trainer/mentor only
  status:       { type: String, enum: ['active','onboarding','inactive','suspended'], default: 'active' },
  joinDate:     { type: Date, default: Date.now },
  lastActive:   { type: Date, default: Date.now },
  // Founder-specific
  businessName: { type: String },
  businessType: { type: String },
  niche:        { type: String },
  // Trainer-specific
  mentorRole:   { type: String, enum: ['trainer','mentor'] },   // trainer=group, mentor=1:1
  sessionsCount:{ type: Number, default: 0 },
  rating:       { type: Number, min: 0, max: 5 },
  // Auth
  refreshToken:      { type: String, select: false },
  passwordResetToken:{ type: String, select: false },
  passwordResetExpires:{ type: Date, select: false },
  emailVerified:    { type: Boolean, default: false },
  notifyEmail:      { type: Boolean, default: true },
  notifyInApp:      { type: Boolean, default: true },
}, { timestamps: true });

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
UserSchema.methods.checkPassword = async function(pw) {
  return bcrypt.compare(pw, this.password);
};
UserSchema.methods.toSafe = function() {
  const obj = this.toObject();
  delete obj.password; delete obj.refreshToken;
  delete obj.passwordResetToken; delete obj.passwordResetExpires;
  return obj;
};
const User = mongoose.model('User', UserSchema);

// ── Cohort ─────────────────────────────────────────────────
const CohortSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: { type: String },
  startDate:   { type: Date },
  endDate:     { type: Date },
  status:      { type: String, enum: ['planning','active','completed','cancelled'], default: 'planning' },
  capacity:    { type: Number, default: 12 },
  // Assignments
  founders:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  trainers:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Progress tracking
  currentStage:{ type: String, default: 'Not started' },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
const Cohort = mongoose.model('Cohort', CohortSchema);

// ── Programme (one per founder) ────────────────────────────
const ProgrammeSchema = new mongoose.Schema({
  founder:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
  cohort:      { type: mongoose.Schema.Types.ObjectId, ref: 'Cohort' },
  stage:       { type: Number, default: 1, min: 1, max: 9 },
  // BMC — 16 steps
  bmc:         { type: Map, of: String, default: {} },
  bmcStep:     { type: Number, default: 0 },
  // Assessments
  assessments: {
    ns:      { type: Number, default: null },
    mindset: { type: Number, default: null },
    skills:  { type: Number, default: null },
    market:  { type: Number, default: null },
  },
  // Offer design
  offer: {
    mustHaves:       String, performance: String, delighters: String,
    mechanisms:      String, island1: String, island2: String, bridge: String,
    guarantee:       String,
    foundingPrice:   String, standardPrice: String, vipPrice: String,
    foundingIncludes:String, standardIncludes: String, vipIncludes: String,
  },
  // Capital
  capital: { type: Object, default: {} },
  // Competitor
  competitor: { type: Object, default: {} },
  // MVP
  mvp: { type: Object, default: {} },
  // Scripts (generated content)
  scripts: {
    discovery:  { content: String, inputs: Object, generatedAt: Date },
    vsl:        { content: String, inputs: Object, generatedAt: Date },
    sparc:      { content: String, inputs: Object, generatedAt: Date },
    outbound:   { content: String, inputs: Object, generatedAt: Date },
    inbound:    { content: String, inputs: Object, generatedAt: Date },
  },
  // Survey
  survey: {
    title:       String,
    description: String,
    targetGroup: String,
    questions:   [Object],
    responses:   [Object],
    goal:        { type: Number, default: 100 },
    analysis:    String,
  },
  // Assigned trainer/mentor
  assignedTrainer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Progress flags
  flags: [{
    type:      String,
    message:   String,
    raisedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolved:  { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });
const Programme = mongoose.model('Programme', ProgrammeSchema);

// ── Session (coaching appointment) ────────────────────────
const SessionSchema = new mongoose.Schema({
  founder:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  trainer:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  cohort:      { type: mongoose.Schema.Types.ObjectId, ref: 'Cohort' },
  type:        { type: String, required: true },
  date:        { type: Date, required: true },
  duration:    { type: Number, default: 60 },  // minutes
  status:      { type: String, enum: ['pending','confirmed','completed','cancelled','no-show'], default: 'pending' },
  notes:       { type: String },               // visible to founder
  prepNote:    { type: String },               // trainer's prep note
  calendarUrl: { type: String },
  // Post-session
  feedback: {
    wentWell:  String,
    improve:   String,
    actions:   String,
    rating:    Number,
    sentAt:    Date,
  },
  trainerNotes: { type: String, select: false }, // private
  recording:    { type: String },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
const Session = mongoose.model('Session', SessionSchema);

// ── Message ────────────────────────────────────────────────
const MessageSchema = new mongoose.Schema({
  from:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject:    { type: String },
  body:       { type: String, required: true },
  type:       { type: String, enum: ['direct','session','feedback','admin','system'], default: 'direct' },
  threadId:   { type: String },           // for grouping replies
  parentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  readAt:     { type: Date },
  readBy:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  deleted:    { type: Boolean, default: false },
  attachments:[{ name: String, url: String, size: Number }],
}, { timestamps: true });
const Message = mongoose.model('Message', MessageSchema);

// ── Activity log ───────────────────────────────────────────
const ActivitySchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:       { type: String, required: true },  // bmc_step, assessment, script_gen, etc.
  message:    { type: String },
  metadata:   { type: Object },
  ip:         { type: String },
}, { timestamps: true });
// Auto-delete after 90 days
ActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });
const Activity = mongoose.model('Activity', ActivitySchema);

// ── Notification ───────────────────────────────────────────
const NotificationSchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:     { type: String },
  title:    { type: String },
  body:     { type: String },
  link:     { type: String },
  read:     { type: Boolean, default: false },
  readAt:   { type: Date },
}, { timestamps: true });
// Auto-delete after 30 days
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });
const Notification = mongoose.model('Notification', NotificationSchema);

// ── Trainer feedback on founder ───────────────────────────
const TrainerFeedbackSchema = new mongoose.Schema({
  trainer:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  founder:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  session:  { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
  type:     { type: String, enum: ['session','bmc','sparc','script','general'], default: 'session' },
  // Scores
  scores: {
    sparc:   { s: Number, p: Number, a: Number, r: Number, c: Number },
    bmc:     { type: Map, of: String }, // stepId -> 'strong'|'ok'|'weak'
    overall: Number,
  },
  // Content
  wentWell:  String,
  improve:   String,
  actions:   String,
  notes:     { type: String, select: false },  // private trainer notes
  rating:    { type: Number, min: 1, max: 5 },
  sentToFounder: { type: Boolean, default: false },
  sentAt:    { type: Date },
}, { timestamps: true });
const TrainerFeedback = mongoose.model('TrainerFeedback', TrainerFeedbackSchema);

// ── AI Usage log ──────────────────────────────────────────
const AIUsageSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  provider:  { type: String },
  model:     { type: String },
  module:    { type: String },      // bmc, sparc, vsl, etc.
  tokens:    { type: Number },
  cost:      { type: Number },
  cached:    { type: Boolean, default: false },
}, { timestamps: true });
AIUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });
const AIUsage = mongoose.model('AIUsage', AIUsageSchema);

module.exports = { User, Cohort, Programme, Session, Message, Activity, Notification, TrainerFeedback, AIUsage };
