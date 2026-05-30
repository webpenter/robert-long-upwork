require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Organization = require('./models/Organization');
const Project = require('./models/Project');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Clear existing seed data
  await Promise.all([
    User.deleteMany({ email: { $in: ['admin@enzymeml.com', 'demo@enzymeml.com'] } }),
    Organization.deleteMany({ slug: 'internal-team' }),
  ]);

  const org = await Organization.create({ name: 'Internal Team', slug: 'internal-team' });

  const adminHash = await User.hashPassword('admin123');
  const admin = await User.create({
    name: 'Admin User',
    email: 'admin@enzymeml.com',
    passwordHash: adminHash,
    role: 'ADMIN',
    tier: 'GOLD',
    org: org._id,
  });

  const demoHash = await User.hashPassword('demo123');
  const demo = await User.create({
    name: 'Demo Scientist',
    email: 'demo@enzymeml.com',
    passwordHash: demoHash,
    role: 'INTERNAL_SCIENTIST',
    tier: 'GOLD',
    org: org._id,
  });

  await Project.create([
    {
      name: 'Lipase Thermostability Campaign',
      description: 'Engineering Candida antarctica lipase B for improved thermal stability at 65°C.',
      targetEnzyme: 'Candida antarctica lipase B (CALB)',
      org: org._id,
      createdBy: demo._id,
    },
    {
      name: 'Trypsin pH Tolerance',
      description: 'Improving trypsin stability across acidic processing conditions (pH 4.5).',
      targetEnzyme: 'Bovine trypsin',
      org: org._id,
      createdBy: demo._id,
    },
  ]);

  console.log('\nSeed complete:');
  console.log('  Admin:     admin@enzymeml.com / admin123  (Gold)');
  console.log('  Scientist: demo@enzymeml.com  / demo123   (Gold)');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
