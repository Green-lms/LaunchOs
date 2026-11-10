// LaunchOS™ — checks .env and tests the database connection.
// Run: npm run check-env   (never prints secret values)
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');
if (!fs.existsSync(envPath)) {
  console.error('✗ No .env file. Copy .env.example to .env first.');
  process.exit(1);
}

const required = ['MONGO_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'ADMIN_INVITE_KEY', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'];
const optional = ['CLAUDE_API_KEY', 'OPENAI_API_KEY', 'SMTP_USER', 'SMTP_PASS', 'MOODLE_URL', 'MOODLE_TOKEN'];
let ok = true;

console.log('\nRequired:');
for (const k of required) {
  const v = process.env[k];
  const set = !!(v && v.trim());
  if (!set) ok = false;
  console.log(`  ${set ? '✓' : '✗'} ${k}${set ? '' : '  ← missing'}`);
}
for (const k of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
  if (process.env[k] && process.env[k].length < 48) { ok = false; console.log(`  ✗ ${k} is too short (use 64+ random chars)`); }
}
if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length < 10) { ok = false; console.log('  ✗ ADMIN_PASSWORD should be at least 10 characters'); }

console.log('\nOptional:');
for (const k of optional) console.log(`  ${process.env[k] ? '✓' : '·'} ${k}`);

(async () => {
  if (process.env.MONGO_URI) {
    process.stdout.write('\nTesting MongoDB connection… ');
    const mongoose = require('mongoose');
    try {
      await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
      console.log('✓ connected to', mongoose.connection.host, '/ db:', mongoose.connection.name);
      await mongoose.connection.close();
    } catch (err) {
      ok = false;
      console.log('✗ failed:', err.message);
      console.log('  Tips: check username/password in the URI, and in Atlas → Network Access allow your IP (or 0.0.0.0/0 for testing).');
    }
  }
  console.log(ok ? '\n✓ Environment looks good. Next: npm run setup, then npm start\n' : '\n✗ Fix the items above, then run again.\n');
  process.exit(ok ? 0 : 1);
})();
