// ═══════════════════════════════════════════════════════════
// LaunchOS™ Notification + Email Service
// Handles all transactional emails across roles
// ═══════════════════════════════════════════════════════════

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST   || 'smtp.gmail.com',
    port:   parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_PORT === '465',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  return transporter;
}

// ── Base email template ───────────────────────────────────
const baseTemplate = (content, title) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Cabinet Grotesk', Arial, sans-serif; background: #0d0f18; color: #e4e8f5; margin: 0; padding: 0; }
  .wrap { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { background: linear-gradient(135deg, #6c5ce7, #26c6da); padding: 20px 24px; border-radius: 10px 10px 0 0; }
  .logo { font-size: 20px; font-weight: 800; color: #fff; letter-spacing: -0.5px; }
  .body { background: #131620; padding: 24px; border-radius: 0 0 10px 10px; border: 1px solid #1e2335; border-top: none; }
  h2 { color: #a29bfe; font-size: 18px; margin-bottom: 12px; }
  p { color: #8892b0; line-height: 1.7; font-size: 14px; margin-bottom: 10px; }
  .highlight { color: #e4e8f5; font-weight: 600; }
  .btn { display: inline-block; background: #6c5ce7; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 13px; margin: 12px 0; }
  .tag { display: inline-block; background: rgba(108,92,231,.15); color: #a29bfe; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-family: monospace; }
  .footer { text-align: center; padding: 14px; font-size: 11px; color: #2e3655; }
  .info-box { background: rgba(38,198,218,.08); border-left: 3px solid #26c6da; padding: 12px 14px; border-radius: 0 6px 6px 0; margin: 12px 0; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header"><div class="logo">LaunchOS™</div><div style="color:rgba(255,255,255,.7);font-size:12px;margin-top:3px">Startup Accelerator Platform</div></div>
  <div class="body">${content}</div>
  <div class="footer">LaunchOS™ · Confidential · <a href="#" style="color:#4a5580">Unsubscribe</a></div>
</div>
</body>
</html>`;

// ── Send helper ───────────────────────────────────────────
async function send(to, subject, html) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log('[Email SKIPPED - no config]', { to, subject });
    return;
  }
  try {
    await getTransporter().sendMail({
      from:    process.env.EMAIL_FROM || 'LaunchOS™ <noreply@launchos.in>',
      to, subject, html,
    });
    console.log('[Email sent]', { to, subject });
  } catch (err) {
    console.error('[Email error]', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
// EMAIL TEMPLATES
// ═══════════════════════════════════════════════════════════

// Welcome — founder
async function sendWelcome(user) {
  const isFounder = user.role === 'founder';
  const html = baseTemplate(`
    <h2>Welcome to LaunchOS™${isFounder ? ', ' + user.name.split(' ')[0] + '!' : '!'}</h2>
    <p>You are now part of the <span class="highlight">LaunchOS™ Startup Accelerator</span>.</p>
    ${isFounder ? `
    <div class="info-box">
      <p style="margin:0"><span class="highlight">Your first steps:</span></p>
      <p style="margin:6px 0 0">1. Complete the 4 Founder Assessments<br>2. Start your Business Model Canvas (BMC)<br>3. Your AI coach is ready whenever you are</p>
    </div>
    <p>Your mentor will be assigned within 48 hours and will reach out to schedule your first session.</p>
    ` : `
    <p>Your ${user.role} account has been created. Log in to access the portal.</p>
    `}
    <a class="btn" href="${process.env.FRONTEND_URL}">Open LaunchOS™ →</a>
    <p style="color:#4a5580;font-size:11px">Questions? Reply to this email or message your admin directly in the platform.</p>
  `);
  await send(user.email, 'Welcome to LaunchOS™ Startup Accelerator!', html);
}

// Session booked — notify founder
async function sendSessionBooked(founder, trainer, session) {
  const date = new Date(session.date).toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const time = new Date(session.date).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
  const html = baseTemplate(`
    <h2>Session Booked ✓</h2>
    <p>A session has been scheduled for you:</p>
    <div class="info-box">
      <p style="margin:0"><span class="highlight">Type:</span> ${session.type.replace(/_/g,' ')}</p>
      <p style="margin:5px 0 0"><span class="highlight">With:</span> ${trainer.name}</p>
      <p style="margin:5px 0 0"><span class="highlight">Date:</span> ${date}</p>
      <p style="margin:5px 0 0"><span class="highlight">Time:</span> ${time}</p>
      <p style="margin:5px 0 0"><span class="highlight">Duration:</span> ${session.duration} minutes</p>
      ${session.zoomLink || session.meetLink ? `<p style="margin:5px 0 0"><span class="highlight">Link:</span> <a href="${session.zoomLink || session.meetLink}" style="color:#a29bfe">${session.zoomLink || session.meetLink}</a></p>` : ''}
    </div>
    ${session.prepForFounder ? `<div class="info-box"><p style="margin:0"><span class="highlight">Prepare:</span> ${session.prepForFounder}</p></div>` : ''}
    <p>Log in to LaunchOS™ to confirm or reschedule.</p>
    <a class="btn" href="${process.env.FRONTEND_URL}/sessions">View session →</a>
  `);
  await send(founder.email, `Session Booked: ${session.type.replace(/_/g,' ')} — ${date}`, html);
}

// Session confirmed — notify founder
async function sendSessionConfirmed(founder, session) {
  const date = new Date(session.date).toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' });
  const html = baseTemplate(`
    <h2>Session Confirmed ✓</h2>
    <p>Your session on <span class="highlight">${date}</span> is confirmed. See you then!</p>
    ${session.zoomLink || session.meetLink ? `<a class="btn" href="${session.zoomLink||session.meetLink}">Join session →</a>` : `<a class="btn" href="${process.env.FRONTEND_URL}">Open LaunchOS™ →</a>`}
  `);
  await send(founder.email, `Confirmed: ${session.type.replace(/_/g,' ')} on ${date}`, html);
}

// Session feedback sent to founder
async function sendSessionFeedback(founder, trainer, feedback) {
  const html = baseTemplate(`
    <h2>Session Feedback from ${trainer.name}</h2>
    <p><span class="tag">${feedback.sessionLabel || 'Recent session'}</span></p>
    ${feedback.wentWell ? `
    <div class="info-box" style="border-color:#00e676">
      <p style="margin:0;color:#00e676;font-weight:700">What went well</p>
      <p style="margin:6px 0 0">${feedback.wentWell.replace(/\n/g,'<br>')}</p>
    </div>` : ''}
    ${feedback.improve ? `
    <div class="info-box" style="border-color:#ffca28">
      <p style="margin:0;color:#ffca28;font-weight:700">Areas to improve</p>
      <p style="margin:6px 0 0">${feedback.improve.replace(/\n/g,'<br>')}</p>
    </div>` : ''}
    ${feedback.actions ? `
    <div class="info-box" style="border-color:#a29bfe">
      <p style="margin:0;color:#a29bfe;font-weight:700">Action items before next session</p>
      <p style="margin:6px 0 0">${feedback.actions.replace(/\n/g,'<br>')}</p>
    </div>` : ''}
    ${feedback.rating ? `<p>Overall rating: <span class="highlight">${'★'.repeat(feedback.rating)}${'☆'.repeat(5-feedback.rating)}</span></p>` : ''}
    <a class="btn" href="${process.env.FRONTEND_URL}">Continue your programme →</a>
  `);
  await send(founder.email, `Session Feedback from ${trainer.name}`, html);
}

// Survey milestone reminder
async function sendSurveyReminder(founder, responseCount, goal) {
  const pct = Math.round((responseCount / goal) * 100);
  const html = baseTemplate(`
    <h2>Survey Update — ${responseCount}/${goal} responses</h2>
    <p>Your MVP Market Validation Survey has <span class="highlight">${responseCount} responses</span> so far (${pct}% of your target).</p>
    ${responseCount < 30 ? `
    <div class="info-box" style="border-color:#ff7043">
      <p style="margin:0;color:#ff7043;font-weight:700">⚠ Minimum 30 required</p>
      <p style="margin:6px 0 0">You need at least ${30 - responseCount} more responses before analysis unlocks. This is non-negotiable — it protects you from building something nobody wants.</p>
    </div>
    <p><strong>To get ${30 - responseCount} responses fast:</strong></p>
    <p>1. Post in 3 relevant WhatsApp groups today<br>2. Send 15 personal LinkedIn DMs<br>3. Ask your network to forward it</p>
    ` : `
    <div class="info-box" style="border-color:#00e676">
      <p style="margin:0;color:#00e676;font-weight:700">✓ Minimum reached — analysis unlocked!</p>
      <p style="margin:6px 0 0">Keep collecting for stronger statistical confidence. Target: 100 responses.</p>
    </div>`}
    <a class="btn" href="${process.env.FRONTEND_URL}/survey">View survey →</a>
  `);
  await send(founder.email, `Survey: ${responseCount}/${goal} responses collected`, html);
}

// Password reset
async function sendPasswordReset(user, token) {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  const html = baseTemplate(`
    <h2>Reset your password</h2>
    <p>You requested a password reset for your LaunchOS™ account.</p>
    <p>Click below to set a new password. This link expires in <span class="highlight">1 hour</span>.</p>
    <a class="btn" href="${resetUrl}">Reset password →</a>
    <p style="color:#4a5580;font-size:11px">If you didn't request this, ignore this email — your password hasn't changed.</p>
  `);
  await send(user.email, 'Reset your LaunchOS™ password', html);
}

// New message notification
async function sendMessageNotification(recipient, sender, message) {
  const html = baseTemplate(`
    <h2>New message from ${sender.name}</h2>
    <div class="info-box">
      ${message.subject ? `<p style="margin:0;font-weight:700">${message.subject}</p>` : ''}
      <p style="margin:${message.subject?'8px':'0'} 0 0">${message.body.slice(0, 200)}${message.body.length > 200 ? '…' : ''}</p>
    </div>
    <a class="btn" href="${process.env.FRONTEND_URL}/messages">Reply in LaunchOS™ →</a>
  `);
  await send(recipient.email, `${sender.name}: ${message.subject || 'New message'}`, html);
}

// Stage completion — celebrate and set next stage
async function sendStageComplete(founder, stageNum, stageName, nextStage) {
  const html = baseTemplate(`
    <h2>🎉 Stage ${stageNum} Complete!</h2>
    <p>Congratulations, <span class="highlight">${founder.name.split(' ')[0]}</span>! You have completed <span class="highlight">${stageName}</span>.</p>
    <div class="info-box" style="border-color:#00e676">
      <p style="margin:0;color:#00e676;font-weight:700">✓ ${stageName} — Done</p>
    </div>
    ${nextStage ? `
    <p>Your next stage is: <span class="highlight">${nextStage}</span></p>
    <p>Log in to LaunchOS™ to continue your programme.</p>
    ` : '<p>You have completed the full programme. Your mentor will be in touch to discuss graduation and next steps.</p>'}
    <a class="btn" href="${process.env.FRONTEND_URL}">Continue programme →</a>
  `);
  await send(founder.email, `🎉 Stage ${stageNum} complete — ${stageName}!`, html);
}

module.exports = {
  sendWelcome, sendSessionBooked, sendSessionConfirmed, sendSessionFeedback,
  sendSurveyReminder, sendPasswordReset, sendMessageNotification, sendStageComplete,
};
