// ═══════════════════════════════════════════════════════════
// LaunchOS™ — Demo Seed Script
// Run: node scripts/seed.js
// Creates demo founders, trainers, cohorts matching frontend
// ═══════════════════════════════════════════════════════════

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { User, Programme, Cohort, Session, Message } = require('../src/models');

const DEMO_PASSWORD = 'Demo@LaunchOS2026!';

const FOUNDERS = [
  { name:'Arjun Sharma',  email:'arjun@startup.in',  city:'Hyderabad', businessName:'EdTech for Tier-2 cities',           niche:'First-time EdTech startup founders in Tier-2 Indian cities' },
  { name:'Priya Mehta',   email:'priya@ventures.co', city:'Mumbai',    businessName:'D2C organic skincare brand',          niche:'Urban Indian women age 25-40 seeking clean beauty' },
  { name:'Rahul Gupta',   email:'rahul@scale.io',    city:'Bengaluru', businessName:'B2B SaaS for HR teams',               niche:'HR managers at mid-size Indian companies 200-1000 employees' },
  { name:'Neha Patel',    email:'neha@brand.com',    city:'Ahmedabad', businessName:'Food delivery aggregator',            niche:'Tier-2 city restaurants needing digital delivery infrastructure' },
  { name:'Kiran Rao',     email:'kiran@fintech.in',  city:'Pune',      businessName:'Micro-lending for MSMEs',             niche:'MSME owners in manufacturing needing working capital' },
  { name:'Divya Singh',   email:'divya@health.co',   city:'Delhi',     businessName:'Mental health app for corporates',    niche:'HR teams at Indian corporates managing employee mental wellness' },
];

const TRAINERS = [
  { name:'Dr Meera Iyer',      email:'meera@launchos.in',   city:'Bengaluru', specialty:'Sales and SPARC', mentorRole:'mentor',  bio:'Former head of sales at Byjus. Expert in SPARC sales coaching.' },
  { name:'Rajiv Nair',         email:'rajiv@launchos.in',   city:'Mumbai',    specialty:'BMC and Offer',   mentorRole:'trainer', bio:'Serial entrepreneur with 3 exits. Expert in business model validation.' },
  { name:'Ananya Krishnan',    email:'ananya@launchos.in',  city:'Chennai',   specialty:'Marketing VSL',   mentorRole:'mentor',  bio:'Former VP Marketing at MakeMyTrip. VSL and funnel specialist.' },
  { name:'Sanjay Verma',       email:'sanjay@launchos.in',  city:'Delhi',     specialty:'Finance Capital', mentorRole:'trainer', bio:'CFO background. Expert in capital planning and investor readiness.' },
  { name:'Preethi Subramaniam',email:'preethi@launchos.in', city:'Hyderabad', specialty:'MVP Validation',  mentorRole:'mentor',  bio:'Product manager ex-Flipkart. Expert in MVP validation.' },
];

async function seed() {
  console.log('LaunchOS™ — Seeding demo data\n');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/launchos');
  console.log('✓ Connected\n');

  // Clear existing demo data
  const existingEmails = [...FOUNDERS, ...TRAINERS].map(u => u.email);
  await User.deleteMany({ email: { $in: existingEmails } });
  console.log('✓ Cleared existing demo accounts');

  // ── Create trainers ─────────────────────────────────────
  const trainerDocs = [];
  for (const t of TRAINERS) {
    const avatar = t.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const user = await User.create({ ...t, password: DEMO_PASSWORD, role: 'trainer', avatar, status: 'active' });
    trainerDocs.push(user);
    console.log('  Created trainer:', t.name, '(' + t.email + ')');
  }

  // ── Create cohorts ──────────────────────────────────────
  await Cohort.deleteMany({ name: { $regex: 'Demo' } });
  const cohort1 = await Cohort.create({
    name: 'Demo Cohort 1 — March 2026', description: 'First demo cohort — service and SaaS founders',
    startDate: new Date('2026-03-01'), endDate: new Date('2026-08-31'),
    status: 'active', capacity: 10, currentStage: 'Week 3 of 18',
    trainers: [trainerDocs[0]._id, trainerDocs[1]._id],
  });
  const cohort2 = await Cohort.create({
    name: 'Demo Cohort 2 — June 2026', description: 'Second demo cohort — product and D2C founders',
    startDate: new Date('2026-06-01'), endDate: new Date('2026-11-30'),
    status: 'planning', capacity: 12,
    trainers: [trainerDocs[1]._id, trainerDocs[2]._id],
  });
  console.log('\n✓ Created cohorts:', cohort1.name, '/', cohort2.name);

  // ── Create founders with programmes ────────────────────
  const stageMap    = [6, 9, 4, 2, 7, 5];
  const bmcMap      = [85, 100, 60, 30, 90, 75];
  const surveyMap   = [45, 100, 12, 0, 78, 55];
  const statusMap   = ['active','active','active','active','active','active'];
  const trainerMap  = [0, 0, 1, 1, 2, 0]; // index into trainerDocs

  for (let i = 0; i < FOUNDERS.length; i++) {
    const f = FOUNDERS[i];
    const avatar = f.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const founder = await User.create({ ...f, password: DEMO_PASSWORD, role: 'founder', avatar, status: statusMap[i] });

    // Build BMC map
    const bmcSteps = Math.round(bmcMap[i] / 100 * 16);
    const bmcData  = {};
    for (let s = 0; s < bmcSteps; s++) {
      bmcData[s.toString()] = `Demo content for step ${s+1} — ${f.niche}`;
    }

    // Build survey responses
    const surveyResponses = [];
    for (let r = 0; r < surveyMap[i]; r++) {
      surveyResponses.push({
        id: require('uuid').v4(),
        answers: { q_prob_1: 'Yes, regularly', q_pain_2: Math.floor(Math.random()*3)+7, q_tried_3: ['Self-taught / YouTube'] },
        timestamp: new Date(Date.now() - r * 3600000),
        source: 'demo',
      });
    }

    await Programme.create({
      founder:         founder._id,
      cohort:          i < 3 ? cohort1._id : cohort2._id,
      stage:           stageMap[i],
      bmc:             bmcData,
      bmcStep:         bmcSteps,
      assignedTrainer: trainerDocs[trainerMap[i]]._id,
      assessments: { ns: 72+i*3, mindset: 65+i*4, skills: 60+i*5, market: 70+i*3 },
      survey: {
        title:       `MVP Survey — ${f.businessName}`,
        description: `Validate our solution for ${f.niche}`,
        targetGroup: f.niche,
        questions:   [],
        responses:   surveyResponses,
        goal:        100,
      },
    });

    // Assign to cohort
    if (i < 3) { cohort1.founders.push(founder._id); }
    else        { cohort2.founders.push(founder._id); }

    console.log('  Created founder:', f.name, '— Stage', stageMap[i], '— BMC', bmcMap[i] + '%', '— Survey', surveyMap[i]);
  }

  await cohort1.save();
  await cohort2.save();
  console.log('\n✓ Cohorts updated with founders');

  // ── Create demo sessions ───────────────────────────────
  const founders = await User.find({ email: { $in: FOUNDERS.map(f=>f.email) } });
  const arjun = founders.find(f=>f.email==='arjun@startup.in');
  const divya = founders.find(f=>f.email==='divya@health.co');
  const meera = trainerDocs[0];

  if (arjun && meera) {
    await Session.create([
      { founder: arjun._id, trainer: meera._id, type:'SPARC™ Roleplay', date: new Date('2026-03-25T10:00:00'), duration: 60, status:'confirmed', notes:'Focus on Probe stage and past failures mapping', createdBy: meera._id },
      { founder: divya._id, trainer: meera._id, type:'Discovery Call Practice', date: new Date('2026-03-26T14:00:00'), duration: 45, status:'confirmed', notes:'Practice full discovery call. Trainer plays prospect.', createdBy: meera._id },
    ]);
    console.log('\n✓ Demo sessions created');
  }

  // ── Create demo messages ───────────────────────────────
  if (arjun && meera) {
    await Message.create([
      { from: arjun._id, to: meera._id, subject: 'SPARC script review', body: 'Hi, I have completed my SPARC script using the BMC. Could you review the Amplify and Resolve stages?', type: 'direct', threadId: 'demo-thread-1' },
      { from: meera._id, to: arjun._id, subject: 'Re: SPARC script review', body: 'Happy to review! I will look at it before our session on Tuesday. Make sure you have mapped the cost of inaction (BMC Step 12) before then.', type: 'direct', threadId: 'demo-thread-1' },
    ]);
    console.log('✓ Demo messages created');
  }

  await mongoose.connection.close();
  console.log('\n══════════════════════════════════════════════');
  console.log('✓ Demo seed complete!\n');
  console.log('Demo accounts (all use password: ' + DEMO_PASSWORD + ')');
  console.log('\n  FOUNDERS (students):');
  FOUNDERS.forEach(f => console.log('    ' + f.email));
  console.log('\n  TRAINERS / MENTORS:');
  TRAINERS.forEach(t => console.log('    ' + t.email));
  console.log('\n  ADMIN:');
  console.log('    admin@launchos.app (password set in .env)');
  console.log('══════════════════════════════════════════════\n');
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
