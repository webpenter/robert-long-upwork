'use strict';
// One-off: give every completed prediction a confidence score, using the same
// rule new predictions get at completion (services/confidence.js). Safe to
// re-run; it only writes the `confidence` field. Usage: node src/scripts/backfillConfidence.js [--dry-run]
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Prediction = require('../models/Prediction');
const { computeConfidence } = require('../services/confidence');

(async () => {
  const dry = process.argv.includes('--dry-run');
  await mongoose.connect(process.env.MONGODB_URI);
  const preds = await Prediction.find({ status: 'COMPLETED', dG: { $ne: null } })
    .select('dG seqLen modelVersion confidence').lean();

  const ops = [];
  const tally = { high: 0, medium: 0, low: 0, uncalibrated: 0 };
  for (const p of preds) {
    const c = computeConfidence({ dg: p.dG, seqLen: p.seqLen, modelVersion: p.modelVersion });
    if (c == null) tally.uncalibrated++;
    else if (c >= 0.7) tally.high++;
    else if (c >= 0.4) tally.medium++;
    else tally.low++;
    if (c !== (p.confidence ?? null)) {
      ops.push({ updateOne: { filter: { _id: p._id }, update: c == null ? { $unset: { confidence: 1 } } : { $set: { confidence: c } } } });
    }
  }
  console.log(`${preds.length} completed predictions:`, tally, `| ${ops.length} to update${dry ? ' (dry run)' : ''}`);
  if (!dry && ops.length) {
    const r = await Prediction.bulkWrite(ops);
    console.log('updated:', r.modifiedCount);
  }
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
