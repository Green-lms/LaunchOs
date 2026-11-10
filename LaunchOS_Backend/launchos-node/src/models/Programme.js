const mongoose = require('mongoose');

// ── BMC Step (16 steps) ──────────────────────────────────
const bmcStepSchema = new mongoose.Schema({
  stepIndex: Number,          // 0-15
  content:   String,
  updatedAt: { type: Date, default: Date.now },
  trainerNote: String,
  trainerScore: { type: String, enum: ['strong','ok','weak',null], default: null },
}, { _id: false });

// ── Assessment ───────────────────────────────────────────
const assessmentSchema = new mongoose.Schema({
  type:       { type: String, enum: ['ns','mindset','skills','market'] },
  score:      Number,
  answers:    mongoose.Schema.Types.Mixed,
  completedAt:{ type: Date, default: Date.now },
}, { _id: false });

// ── Survey ───────────────────────────────────────────────
const surveyQuestionSchema = new mongoose.Schema({
  id:       String,
  type:     { type: String, enum: ['scale','single','multi','yesno','open','price','nps','rank'] },
  text:     String,
  options:  [String],
  required: Boolean,
  scale:    Boolean,
  nps:      Boolean,
}, { _id: false });

const surveyResponseSchema = new mongoose.Schema({
  respondentId: String,           // anonymous hash or user id
  answers:      mongoose.Schema.Types.Mixed,
  submittedAt:  { type: Date, default: Date.now },
  source:       { type: String, enum: ['direct','manual','external'], default: 'direct' },
}, { _id: false });

// ── Script ───────────────────────────────────────────────
const scriptSchema = new mongoose.Schema({
  type:       { type: String, enum: ['sparc','discovery','vsl','outbound','inbound'] },
  content:    mongoose.Schema.Types.Mixed,   // {S:'...',P:'...'} or {act1:'...'} etc.
  aiGenerated:Boolean,
  generatedAt:Date,
  trainerFeedback: String,
  trainerScore: Number,
}, { _id: false });

// ── Main Programme Schema ────────────────────────────────
const programmeSchema = new mongoose.Schema({
  founderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

  // Stage tracking (0-9, 0 = not started)
  currentStage:  { type: Number, default: 0, min: 0, max: 9 },
  stageProgress: { type: Map, of: Number, default: {} }, // stageN -> % complete

  // BMC Builder — 16 steps
  bmc: {
    steps:       { type: [bmcStepSchema], default: [] },
    completedAt: Date,
    lastUpdated: { type: Date, default: Date.now },
  },

  // Offer Design
  offer: {
    kanoMustHaves:  String,
    kanoPerformance:String,
    kanoDelighters: String,
    mechanisms:     String,
    island1:        String,
    island2:        String,
    bridgeMilestones:String,
    guarantee:      String,
    pricingTiers:   mongoose.Schema.Types.Mixed,
    lastUpdated:    { type: Date, default: Date.now },
  },

  // Assessments
  assessments: { type: [assessmentSchema], default: [] },

  // MVP Survey
  survey: {
    title:       String,
    description: String,
    targetGroup: String,
    goal:        { type: Number, default: 100 },
    questions:   { type: [surveyQuestionSchema], default: [] },
    responses:   { type: [surveyResponseSchema], default: [] },
    analysis:    String,
    lastUpdated: { type: Date, default: Date.now },
  },

  // Scripts
  scripts: { type: [scriptSchema], default: [] },

  // Capital Budget
  capital: {
    currency:    { type: String, default: 'INR' },
    totalBudget: Number,
    description: String,
    categories:  mongoose.Schema.Types.Mixed,
    aiAnalysis:  String,
    lastUpdated: { type: Date, default: Date.now },
  },

  // Competitor Analysis
  competitor: {
    competitors: mongoose.Schema.Types.Mixed,
    swotAnalysis:String,
    aiReport:    String,
    lastUpdated: { type: Date, default: Date.now },
  },

  // MVP + ROI Model
  mvp: {
    modelData:   mongoose.Schema.Types.Mixed,
    aiAnalysis:  String,
    lastUpdated: { type: Date, default: Date.now },
  },

  // Scale Engine
  scale: {
    data:        mongoose.Schema.Types.Mixed,
    lastUpdated: { type: Date, default: Date.now },
  },

  // Trainer feedback per module
  trainerFeedback: [{
    module:     String,
    trainerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    wentWell:   String,
    improve:    String,
    actions:    String,
    rating:     Number,
    sessionId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
    createdAt:  { type: Date, default: Date.now },
  }],

  // Private trainer notes (not visible to founder)
  trainerNotes: [{
    trainerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note:      String,
    isFlag:    { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now },
  }],

  // Moodle sync
  moodle: {
    courseId:    Number,
    enrolled:    { type: Boolean, default: false },
    progress:    { type: Number, default: 0 },
    lastSync:    Date,
  },

}, { timestamps: true });

programmeSchema.index({ founderId: 1 });

// Computed virtual: overall completion %
programmeSchema.virtual('overallPct').get(function() {
  const bmcDone = this.bmc?.steps?.filter(s => s.content?.trim()).length || 0;
  return Math.round((bmcDone / 16) * 100);
});

module.exports = mongoose.model('Programme', programmeSchema);
