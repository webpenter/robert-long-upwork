'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const Prediction = require('./src/models/Prediction');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/HsFAst';

async function main() {
  await mongoose.connect(MONGODB_URI);

  // Find predictions stuck in RUNNING or QUEUED for more than 60 seconds
  const cutoff = new Date(Date.now() - 60 * 1000);
  const stuck = await Prediction.find({
    status: { $in: ['RUNNING', 'QUEUED'] },
    updatedAt: { $lt: cutoff },
  }).select('_id status createdAt updatedAt');

  console.log(`Found ${stuck.length} stuck prediction(s):`);
  stuck.forEach(p => console.log(`  ${p._id}  status=${p.status}  updated=${p.updatedAt}`));

  if (stuck.length === 0) {
    console.log('Nothing to reset.');
    await mongoose.disconnect();
    return;
  }

  const res = await Prediction.updateMany(
    { status: { $in: ['RUNNING', 'QUEUED'] }, updatedAt: { $lt: cutoff } },
    { $set: { status: 'FAILED', errorMessage: 'Reset after Phase F deployment — please run a new prediction.' } }
  );
  console.log(`Reset ${res.modifiedCount} prediction(s) to FAILED.`);
  await mongoose.disconnect();
  console.log('Done. Refresh the browser and run a new prediction.');
}

main().catch(err => { console.error(err.message); process.exit(1); });
