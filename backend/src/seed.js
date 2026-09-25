// One-time bootstrap for an EMPTY database: creates the internal organisation and
// a single administrator. Public sign-up is closed (routes/auth.js), so every
// other account is created by that admin under Settings → Users.
//
// No credentials live in this file. The admin email comes from SEED_ADMIN_EMAIL;
// the password is generated here and printed once. It refuses to run against a
// database that already has users, so it cannot overwrite a live admin.
require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('./models/User');
const Organization = require('./models/Organization');

async function seed() {
  const email = (process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) throw new Error('Set SEED_ADMIN_EMAIL to the address the first admin will sign in with.');

  await mongoose.connect(process.env.MONGODB_URI);
  if (await User.countDocuments()) {
    throw new Error('This database already has users. Create further accounts under Settings → Users.');
  }

  const org = await Organization.findOne({ slug: 'internal-team' })
    || await Organization.create({ name: 'Internal Team', slug: 'internal-team' });

  const password = crypto.randomBytes(18).toString('base64url');
  await User.create({
    name: process.env.SEED_ADMIN_NAME || 'Administrator',
    email,
    passwordHash: await User.hashPassword(password),
    role: 'ADMIN',
    tier: 'GOLD',
    org: org._id,
  });

  console.log('\nFirst administrator created:');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}   (shown once; change it under Settings → Password)`);
  await mongoose.disconnect();
}

seed().catch(async (err) => {
  console.error(err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
