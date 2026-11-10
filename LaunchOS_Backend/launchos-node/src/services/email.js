// ═══════════════════════════════════════════════════════════
// LaunchOS™ — Email Service
// Nodemailer + HTML templates for all system emails
// ═══════════════════════════════════════════════════════════

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

// ── Base HTML wrapper ──────────────────────────────────────
function baseTemplate(title, body, ctaText, ctaUrl) {
  const cta = ctaText && ctaUrl
    ? `<div style="text-align:center;margin:28px 0">
         <a href="${ctaUrl}" style="background:#6c5ce7;color:#fff;text-decoration:none;padding:12px 28px;border-radius:7px;font-weight:700;font-size:14px;display:inline-block">${ctaText}</a>
       </div>`
    : '';
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:'Cabinet Grotesk',Arial,sans-serif">
  <div style="max-width:580px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#6c5ce7,#a29bfe);padding:28px 32px">
      <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">LaunchOS™</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:3px">Startup Accelerator Platform</div>
    </div>
    <!-- Body -->
    <div style="padding:32px">
      ${body}
      ${cta}
    </div>
    <!-- Footer -->
    <div style="background:#f5f6fa;padding:18px 32px;border-top:1px solid #e8eaf6;text-align:center">
      <p style="font-size:11px;color:#9ca3af;margin:0">LaunchOS™ · Startup Accelerator · <a href="#" style="color:#6c5ce7;text-decoration:none">Unsubscribe</a></p>
    </div>
  </div>
</body></html>`;
}

function h(text) {
  return `<h2 style="font-size:18px;font-weight:700;color:#1a1a2e;margin:0 0 14px">${text}</h2>`;
}
function p(text) {
  return `<p style="font-size:13px;color:#374151;line-height:1.75;margin:0 0 12px">${text}</p>`;
}
function box(items) {
  const rows = items.map(([l,v]) =>
    `<tr><td style="font-size:11px;font-weight:600;color:#6c5ce7;padding:5px 10px 5px 0;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap">${l}</td>
     <td style="font-size:12px;color:#374151;padding:5px 0">${v}</td></tr>`
  ).join('');
  return `<table style="width:100%;background:#f5f6fa;border-radius:7px;padding:12px 14px;margin:14px 0;border-collapse:collapse">${rows}</table>`;
}

// ── Send ───────────────────────────────────────────────────
async function send(to, subject, html) {
  if (!process.env.SMTP_USER) {
    console.log(`[Email DEV] To: ${to} | Subject: ${subject}`);
    return { skipped: true };
  }
  try {
    const info = await getTransporter().sendMail({
      from:    process.env.EMAIL_FROM || 'LaunchOS™ <noreply@launchos.app>',
      to, subject, html,
    });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error('Email error:', err.message);
    return { sent: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
// EMAIL TEMPLATES
// ═══════════════════════════════════════════════════════════

// ── Founder: Welcome to programme ─────────────────────────
async function welcomeFounder(founder, cohort) {
  const html = baseTemplate('Welcome to LaunchOS™',
    h('Welcome to the LaunchOS™ Startup Accelerator, ' + founder.name + '! 🚀') +
    p('You are officially enrolled. Here is what happens next:') +
    box([
      ['Programme', 'LaunchOS™ 9-Stage Startup Accelerator'],
      ['Your Cohort', cohort?.name || 'Assigned soon'],
      ['First Step',  'Complete your 4 Founder Assessments'],
      ['Platform',    'Log in at launchos.app'],
    ]) +
    p('Your journey starts with the Business Model Canvas (BMC) — 16 steps that will become the foundation for every script, every sales call, and every investor pitch you make.') +
    p('Your mentor will be in touch within 24 hours to schedule your onboarding call.'),
    'Open My Dashboard', process.env.FRONTEND_URL
  );
  return send(founder.email, 'Welcome to LaunchOS™ — Your startup journey starts now', html);
}

// ── Founder: Session booked ───────────────────────────────
async function sessionBooked(founder, trainer, session) {
  const html = baseTemplate('Session Booked',
    h('Your session has been booked ✓') +
    p('Your mentor has confirmed a coaching session with you.') +
    box([
      ['Mentor',    trainer.name],
      ['Type',      session.type],
      ['Date',      new Date(session.date).toLocaleDateString('en-IN', {weekday:'long',year:'numeric',month:'long',day:'numeric'})],
      ['Time',      new Date(session.date).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'})],
      ['Duration',  session.duration + ' minutes'],
    ]) +
    (session.notes ? `<div style="background:#ede7ff;border-left:3px solid #6c5ce7;padding:10px 14px;border-radius:0 6px 6px 0;font-size:12px;color:#4a3f8f;margin:14px 0"><strong>Prep note:</strong> ${session.notes}</div>` : ''),
    'Add to Google Calendar',
    `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('LaunchOS™: '+session.type)}&dates=${new Date(session.date).toISOString().replace(/[-:]/g,'').slice(0,15)}/${new Date(new Date(session.date).getTime()+session.duration*60000).toISOString().replace(/[-:]/g,'').slice(0,15)}`
  );
  return send(founder.email, 'Session confirmed — ' + session.type + ' with ' + trainer.name, html);
}

// ── Founder: Feedback from trainer ───────────────────────
async function sessionFeedback(founder, trainer, feedback, sessionType) {
  const ratingStars = '★'.repeat(feedback.rating||0) + '☆'.repeat(5-(feedback.rating||0));
  const html = baseTemplate('Session Feedback',
    h('Feedback from your ' + sessionType + ' session') +
    p('Your mentor <strong>' + trainer.name + '</strong> has shared their feedback from your session.') +
    `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin:14px 0">
      <div style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">What went well</div>
      <div style="font-size:12px;color:#15803d;line-height:1.65">${feedback.wentWell || '—'}</div>
    </div>` +
    `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin:14px 0">
      <div style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Areas to work on</div>
      <div style="font-size:12px;color:#b45309;line-height:1.65">${feedback.improve || '—'}</div>
    </div>` +
    (feedback.actions ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin:14px 0">
      <div style="font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Action items before next session</div>
      <div style="font-size:12px;color:#1d4ed8;line-height:1.65;white-space:pre-wrap">${feedback.actions}</div>
    </div>` : '') +
    `<div style="text-align:center;font-size:22px;margin:16px 0">${ratingStars}</div>`,
    'Open My Dashboard', process.env.FRONTEND_URL
  );
  return send(founder.email, 'Session feedback from ' + trainer.name, html);
}

// ── Founder: Survey nudge ─────────────────────────────────
async function surveyNudge(founder, currentCount) {
  const html = baseTemplate('Survey Reminder',
    h('You need ' + (30 - currentCount) + ' more survey responses 📊') +
    p('You currently have <strong>' + currentCount + ' responses</strong> in your MVP survey. You need a minimum of 30 before the AI analysis unlocks — and 100 for statistically meaningful validation.') +
    p('Here is how to get there this week:') +
    `<ul style="font-size:12px;color:#374151;line-height:2;padding-left:18px">
      <li>Post in 3 relevant WhatsApp groups today</li>
      <li>Send 20 personal LinkedIn DMs to your niche</li>
      <li>Ask 5 people you know directly to fill it</li>
      <li>Share in relevant Facebook/Telegram groups</li>
    </ul>` +
    p('The survey step is non-negotiable — it protects you from building something nobody wants.'),
    'Open Survey Panel', process.env.FRONTEND_URL
  );
  return send(founder.email, 'Action needed: ' + (30 - currentCount) + ' more survey responses', html);
}

// ── Founder: BMC completion nudge ────────────────────────
async function bmcNudge(founder, completedSteps) {
  const html = baseTemplate('Complete Your BMC',
    h('Your BMC is ' + Math.round(completedSteps/16*100) + '% complete') +
    p('You have completed <strong>' + completedSteps + '/16 steps</strong> of your Business Model Canvas. Every script, sales call, and investor pitch flows from what you build here.') +
    p('The next steps to complete:') +
    box([
      ['Step 11', 'Past Failures — feeds your SPARC™ Probe stage'],
      ['Step 12', 'Cost of Inaction — feeds your SPARC™ Amplify stage'],
      ['Step 13', 'Founder Story — feeds your VSL and Discovery Call'],
      ['Step 14', 'Social Proof — feeds your SPARC™ Close'],
    ]) +
    p('Take 30 minutes today and complete 2–3 more steps.'),
    'Open BMC Builder', process.env.FRONTEND_URL
  );
  return send(founder.email, 'Your BMC needs attention — ' + completedSteps + '/16 steps done', html);
}

// ── Founder: Stage completion congratulations ─────────────
async function stageComplete(founder, stage, stageName, nextStageName) {
  const html = baseTemplate('Stage Complete!',
    h('🎉 Stage ' + stage + ' Complete — ' + stageName) +
    p('Congratulations, <strong>' + founder.name + '</strong>! You have just completed Stage ' + stage + ' of the LaunchOS™ programme.') +
    p('This is a real milestone. You are building something few founders ever complete — a fully systematised, evidence-based startup.') +
    box([['Next stage', 'Stage ' + (stage+1) + ' — ' + (nextStageName||'Coming up')]]) +
    p('Your mentor will be in touch to kick off the next stage. Keep your momentum going.'),
    'Open Dashboard', process.env.FRONTEND_URL
  );
  return send(founder.email, '🎉 Stage ' + stage + ' complete — ' + stageName, html);
}

// ── Trainer: New founder assigned ────────────────────────
async function trainerFounderAssigned(trainer, founder) {
  const html = baseTemplate('New Founder Assigned',
    h('New founder assigned to you: ' + founder.name) +
    p('A new startup founder has been assigned to your roster.') +
    box([
      ['Founder',  founder.name],
      ['Business', founder.businessName || 'Not specified'],
      ['City',     founder.city || '—'],
      ['Email',    founder.email],
    ]) +
    p('Please reach out within 48 hours to schedule an onboarding call and review their Founder Assessments and BMC progress.'),
    'Open Trainer Portal', process.env.FRONTEND_URL + '/trainer'
  );
  return send(trainer.email, 'New founder assigned — ' + founder.name, html);
}

// ── Trainer: Session reminder ─────────────────────────────
async function sessionReminder(trainer, founder, session) {
  const html = baseTemplate('Session in 24 hours',
    h('Reminder: session tomorrow with ' + founder.name) +
    box([
      ['Founder',  founder.name],
      ['Type',     session.type],
      ['Date',     new Date(session.date).toLocaleDateString('en-IN', {weekday:'long',year:'numeric',month:'long',day:'numeric'})],
      ['Time',     new Date(session.date).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'})],
      ['Duration', session.duration + ' minutes'],
    ]) +
    (session.prepNote ? '<p style="font-size:12px;color:#374151">Prep note: ' + session.prepNote + '</p>' : ''),
    'Open Trainer Portal', process.env.FRONTEND_URL + '/trainer'
  );
  return send(trainer.email, 'Reminder: session tomorrow — ' + founder.name + ' (' + session.type + ')', html);
}

// ── Admin: At-risk founder alert ──────────────────────────
async function adminAtRiskAlert(admin, founder, reason) {
  const html = baseTemplate('At-Risk Founder Alert',
    h('⚠ Founder needs attention: ' + founder.name) +
    p('A founder in your programme has been flagged as at-risk.') +
    box([
      ['Founder',     founder.name],
      ['Business',    founder.businessName || '—'],
      ['Reason',      reason],
      ['Last active', founder.lastActive ? new Date(founder.lastActive).toLocaleDateString('en-IN') : 'Unknown'],
    ]) +
    p('Please review their progress in the Admin Portal and assign additional support if needed.'),
    'Open Admin Portal', process.env.FRONTEND_URL + '/admin'
  );
  return send(admin.email, '⚠ At-risk founder: ' + founder.name, html);
}

// ── Password reset ────────────────────────────────────────
async function passwordReset(user, resetUrl) {
  const html = baseTemplate('Reset Your Password',
    h('Password reset request') +
    p('Someone requested a password reset for your LaunchOS™ account. If this was you, click the button below.') +
    p('This link expires in <strong>1 hour</strong>.') +
    p('If you did not request a password reset, ignore this email — your password will not change.'),
    'Reset My Password', resetUrl
  );
  return send(user.email, 'LaunchOS™ — Reset your password', html);
}

// ── Generic notification ──────────────────────────────────
async function notification(toEmail, subject, title, bodyText, ctaText, ctaUrl) {
  const html = baseTemplate(title, h(title) + p(bodyText), ctaText, ctaUrl);
  return send(toEmail, subject, html);
}

module.exports = {
  welcomeFounder, sessionBooked, sessionFeedback, surveyNudge, bmcNudge,
  stageComplete, trainerFounderAssigned, sessionReminder, adminAtRiskAlert,
  passwordReset, notification, send,
};
