const mongoose = require('mongoose');

// ═══════════════════════════════════════════════════════════
// COHORT
// ═══════════════════════════════════════════════════════════
const cohortSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: String,
  startDate:   Date,
  endDate:     Date,
  status:      { type: String, enum: ['planning','active','completed','open'], default: 'planning' },
  capacity:    { type: Number, default: 12 },
  founders:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  trainers:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  moodleCourseId: Number,
  currentWeek:  { type: Number, default: 0 },
  totalWeeks:   { type: Number, default: 18 },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

cohortSchema.index({ status: 1 });

// ═══════════════════════════════════════════════════════════
// SESSION (appointments between trainer/admin and founder)
// ═══════════════════════════════════════════════════════════
const sessionSchema = new mongoose.Schema({
  founderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  trainerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  cohortId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Cohort' },

  type: { type: String, enum: [
    'sparc_roleplay','discovery_practice','bmc_review',
    'vsl_review','progress_review','survey_analysis',
    'strategy_session','pricing_workshop','qa_session',
    'group_session','other'
  ], required: true },

  date:        { type: Date, required: true },
  duration:    { type: Number, default: 60 },   // minutes
  status:      { type: String, enum: ['pending','confirmed','completed','cancelled','rescheduled'], default: 'pending' },

  notes:       String,   // visible to both
  prepForFounder: String,
  trainerPrep:   String,  // private to trainer

  // Post-session
  postSession: {
    wentWell:   String,
    improve:    String,
    actions:    String,
    rating:     { type: Number, min: 1, max: 5 },
    completedAt:Date,
  },

  // Calendar integration
  googleCalEventId: String,
  zoomLink:         String,
  meetLink:         String,

  bookedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelReason:String,

}, { timestamps: true });

sessionSchema.index({ founderId: 1, date: -1 });
sessionSchema.index({ trainerId: 1, date: -1 });
sessionSchema.index({ status: 1 });

// ═══════════════════════════════════════════════════════════
// MESSAGE (internal messaging across all roles)
// ═══════════════════════════════════════════════════════════
const messageSchema = new mongoose.Schema({
  senderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  subject:    String,
  body:       { type: String, required: true },
  type:       { type: String, enum: ['direct','system','feedback','flag','announcement'], default: 'direct' },

  read:       { type: Boolean, default: false },
  readAt:     Date,

  attachments:[{
    filename: String,
    url:      String,
    size:     Number,
  }],

  // Thread support
  threadId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },  // null = root
  replyCount: { type: Number, default: 0 },

  // For announcements
  broadcastTo:{ type: String, enum: ['all_founders','cohort','trainer_team',null], default: null },
  cohortId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Cohort' },

}, { timestamps: true });

messageSchema.index({ receiverId: 1, read: 1 });
messageSchema.index({ senderId:   1, createdAt: -1 });
messageSchema.index({ threadId:   1, createdAt:  1 });

// ═══════════════════════════════════════════════════════════
// NOTIFICATION
// ═══════════════════════════════════════════════════════════
const notificationSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:     { type: String, enum: [
    'session_booked','session_confirmed','session_reminder','session_cancelled',
    'message_received','feedback_received','stage_completed','survey_milestone',
    'bmc_reminder','cohort_update','system'
  ], required: true },
  title:    String,
  body:     String,
  link:     String,    // e.g. /sessions/abc123
  read:     { type: Boolean, default: false },
  readAt:   Date,
  data:     mongoose.Schema.Types.Mixed,  // extra payload for frontend
}, { timestamps: true });

notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = {
  Cohort:       mongoose.model('Cohort',       cohortSchema),
  Session:      mongoose.model('Session',      sessionSchema),
  Message:      mongoose.model('Message',      messageSchema),
  Notification: mongoose.model('Notification', notificationSchema),
};
