'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const path   = require('path');
const fs     = require('fs');
const mongoose = require('mongoose');

const connectDB       = require('../db');
const User            = require('../models/User');
const Project         = require('../models/Project');
const Experiment      = require('../models/Experiment');
const Variant         = require('../models/Variant');
const Measurement     = require('../models/Measurement');
const { parseUploadedFile } = require('../services/csvParser');
const { computeHalfLives, normalizeToReference } = require('../services/analyticsService');

const ROOT = path.join(__dirname, '../../../');

const CSV_FILES = {
  kinetic:        path.join(ROOT, 'denaturation_70C_hsFAST_screen (1).csv'),
  lysate:         path.join(ROOT, 'platereader_lysate_hsFAST_screen_mock data.csv'),
  facs:           path.join(ROOT, 'facs_cell_hsFAST_screen_mock data.csv'),
  standardCurves: path.join(ROOT, 'standard_curves_bradford_FAST.csv'),
};

// ── Parse mutation string "K249T" → {from, position, to} ────────────────────
function parseMutation(str) {
  const m = str.trim().match(/^([A-Z])(\d+)([A-Z])$/);
  if (!m) return null;
  return { from: m[1], position: parseInt(m[2], 10), to: m[3], notation: str.trim() };
}

async function main() {
  await connectDB();
  console.log('\n=== hsFAST Data Import ===\n');

  // ── 1. Get or create admin user ────────────────────────────────────────────
  let admin = await User.findOne({ email: 'admin@enzymeml.com' });
  if (!admin) {
    console.log('Admin user not found — run `npm run seed` first');
    process.exit(1);
  }

  // ── 2. Remove existing import data (idempotent re-run) ────────────────────
  const existingProject = await Project.findOne({ name: 'hsFAST Screening Campaign v1' });
  if (existingProject) {
    const expIds = await Experiment.find({ project: existingProject._id }).distinct('_id');
    await Measurement.deleteMany({ experiment: { $in: expIds } });
    await Variant.deleteMany({ project: existingProject._id });
    await Experiment.deleteMany({ project: existingProject._id });
    await Project.deleteOne({ _id: existingProject._id });
    console.log('Cleared previous import data\n');
  }

  // ── 3. Create project ──────────────────────────────────────────────────────
  const project = await Project.create({
    name: 'hsFAST Screening Campaign v1',
    description: 'Single-point mutation library screened by hsFAST/GlowTag reporter. 50 library variants, 4 control types, 3 assay modalities.',
    targetEnzyme: 'Target enzyme — parent sequence pending',
    createdBy: admin._id,
  });
  console.log(`Created project: ${project.name}`);

  // ── 4. Create experiments ──────────────────────────────────────────────────
  const expDate = new Date('2025-01-15');

  const expKinetic = await Experiment.create({
    project:   project._id,
    name:      'Thermal Denaturation 70°C — Kinetic Plate Reader',
    date:      expDate,
    operator:  'hsFAST Team',
    instrument:'Plate Reader',
    assayType: 'THERMAL',
    notes:     'Fluorescence decay over 60 min at 70°C. 31 time points at 2-min intervals. 3 replicates per variant.',
    createdBy: admin._id,
  });

  const expLysate = await Experiment.create({
    project:   project._id,
    name:      'Lysate Endpoint — Plate Reader (OD600 Normalized)',
    date:      expDate,
    operator:  'hsFAST Team',
    instrument:'Plate Reader',
    assayType: 'THERMAL',
    notes:     'Endpoint fluorescence of cell lysate, normalized by OD600 harvest density. 2 plates.',
    createdBy: admin._id,
  });

  const expFACS = await Experiment.create({
    project:   project._id,
    name:      'Cell-Based FACS — In-Cell Folding',
    date:      expDate,
    operator:  'hsFAST Team',
    instrument:'Flow Cytometer',
    assayType: 'OTHER',
    notes:     'Per-cell fluorescence by flow cytometry. Percent_FAST_Positive is primary stability metric.',
    createdBy: admin._id,
  });

  const expStd = await Experiment.create({
    project:   project._id,
    name:      'Standard Curves — Bradford & FAST Fluorescence',
    date:      expDate,
    operator:  'hsFAST Team',
    instrument:'Plate Reader',
    assayType: 'OTHER',
    notes:     'Bradford BSA standard curve (0–2000 µg/mL) and FAST fluorescence standard curve (0–400 µg/mL).',
    createdBy: admin._id,
  });

  console.log('Created 4 experiments');

  // ── 5. Parse and import all CSV files ─────────────────────────────────────
  console.log('\nImporting CSV files...');

  const resultKinetic = await parseUploadedFile(CSV_FILES.kinetic,        expKinetic._id);
  console.log(`  Kinetic CSV:         ${resultKinetic.count} measurements`);

  const resultLysate  = await parseUploadedFile(CSV_FILES.lysate,         expLysate._id);
  console.log(`  Lysate CSV:          ${resultLysate.count} measurements`);

  const resultFACS    = await parseUploadedFile(CSV_FILES.facs,           expFACS._id);
  console.log(`  FACS CSV:            ${resultFACS.count} measurements`);

  const resultStd     = await parseUploadedFile(CSV_FILES.standardCurves, expStd._id);
  console.log(`  Standard curves CSV: ${resultStd.count} measurements`);

  // ── 6. Create Variant documents from the lysate CSV ───────────────────────
  // (All 3 assay files cover the same V001–V050 variants — use lysate as master list)
  console.log('\nCreating Variant documents...');

  const lysateMeasurements = await Measurement.find({
    experiment:  expLysate._id,
    sampleType:  'VARIANT',
  }).select('sampleId variantDescription').lean();

  // Deduplicate by sampleId
  const seen = new Set();
  const variantDocs = [];
  for (const m of lysateMeasurements) {
    if (!m.sampleId || seen.has(m.sampleId)) continue;
    seen.add(m.sampleId);
    const mut = parseMutation(m.variantDescription || '');
    variantDocs.push({
      project:   project._id,
      name:      m.sampleId,
      mutations: mut ? [mut] : [],
      familyAnnotation: 'hsFAST-screened library',
    });
  }

  const savedVariants = await Variant.insertMany(variantDocs);
  console.log(`  Created ${savedVariants.length} variant documents`);

  // ── 7. Link Measurements to Variants across all three assay experiments ────
  const variantBySampleId = {};
  for (const v of savedVariants) variantBySampleId[v.name] = v._id;

  for (const expId of [expKinetic._id, expLysate._id, expFACS._id]) {
    const variantMeasurements = await Measurement.find({
      experiment: expId,
      sampleType: 'VARIANT',
    }).select('_id sampleId').lean();

    const bulkOps = variantMeasurements
      .filter(m => variantBySampleId[m.sampleId])
      .map(m => ({
        updateOne: {
          filter: { _id: m._id },
          update: { $set: { variant: variantBySampleId[m.sampleId] } },
        },
      }));

    if (bulkOps.length) await Measurement.bulkWrite(bulkOps);
  }
  console.log('  Linked measurements to variants');

  // ── 8. Run analytics ───────────────────────────────────────────────────────
  console.log('\nRunning analytics...');

  const hlCount = await computeHalfLives(expKinetic._id);
  console.log(`  Half-lives computed: ${hlCount} kinetic measurements`);

  const fcCount = await normalizeToReference(expLysate._id);
  console.log(`  Fold-changes computed: ${fcCount} lysate measurements`);

  const facsUpdated = await computeFACSNormalization(expFACS._id);
  console.log(`  FACS fold-change computed: ${facsUpdated} FACS measurements`);

  // ── 9. Build and save training dataset JSON ───────────────────────────────
  console.log('\nBuilding training dataset...');

  const trainingData = await buildTrainingDataset(project._id, {
    expKineticId: expKinetic._id,
    expLysateId:  expLysate._id,
    expFACSId:    expFACS._id,
  });

  const outPath = path.join(__dirname, '../../..', 'ml-service', 'data', 'training_data.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(trainingData, null, 2));
  console.log(`  Saved ${trainingData.variants.length} training variants to ml-service/data/training_data.json`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n=== Import Complete ===');
  console.log(`  Project:    ${project.name} (${project._id})`);
  console.log(`  Variants:   ${savedVariants.length}`);
  console.log(`  Training records: ${trainingData.variants.length} variants with all 3 assay labels`);
  console.log('\nNext: cd ml-service && pip install -r requirements.txt && python train.py');

  await mongoose.disconnect();
}

// ── Compute FACS fold-change vs WT_HSFAST_FUSION reference ──────────────────

async function computeFACSNormalization(experimentId) {
  const measurements = await Measurement.find({ experiment: experimentId, excluded: false });

  const refPcts = measurements
    .filter(m => m.sampleType === 'REFERENCE')
    .map(m => m.metadata?.pctFastPositive)
    .filter(v => v != null && v > 0);

  if (refPcts.length === 0) return 0;
  const refMean = refPcts.reduce((a, b) => a + b, 0) / refPcts.length;

  let updated = 0;
  for (const m of measurements) {
    const pct = m.metadata?.pctFastPositive;
    if (pct == null) continue;

    const fc = parseFloat((pct / refMean).toFixed(4));
    const filtered = (m.derivedMetrics || []).filter(d => d.unit !== 'facs_fc');
    filtered.push({
      metricType: 'fold_change',
      value: fc,
      unit: 'facs_fc',
      analyticsVersion: '1.1',
    });

    await Measurement.findByIdAndUpdate(m._id, { derivedMetrics: filtered });
    updated++;
  }
  return updated;
}

// ── Build training dataset from MongoDB ──────────────────────────────────────
// Returns {variants: [{sampleId, mutation, from_aa, to_aa, position, labels}]}

async function buildTrainingDataset(projectId, { expKineticId, expLysateId, expFACSId }) {
  const variants = await Variant.find({ project: projectId }).lean();

  // WT reference values
  const wtKinetic = await getWTHalfLife(expKineticId);
  const wtLysate  = await getWTLysateFoldChange(expLysateId);
  const wtFACS    = await getWTFACSPct(expFACSId);

  const records = [];

  for (const v of variants) {
    if (!v.mutations || v.mutations.length === 0) continue;
    const mut = v.mutations[0];

    // Get per-variant half-life (mean over replicates)
    const kineticMs = await Measurement.find({
      experiment: expKineticId,
      variant: v._id,
      excluded: false,
    }).lean();

    const halfLives = kineticMs
      .flatMap(m => m.derivedMetrics.filter(d => d.metricType === 'half_life'))
      .map(d => d.value)
      .filter(v => v != null && v > 0);

    // Get per-variant lysate fold change (already normalized in analyticsService)
    const lysateMs = await Measurement.find({
      experiment: expLysateId,
      variant: v._id,
      excluded: false,
    }).lean();

    const lysateFCs = lysateMs
      .flatMap(m => m.derivedMetrics.filter(d => d.metricType === 'fold_change' && d.unit === 'fold vs WT'))
      .map(d => d.value)
      .filter(v => v != null);

    // Get per-variant FACS fold change
    const facsMs = await Measurement.find({
      experiment: expFACSId,
      variant: v._id,
      excluded: false,
    }).lean();

    const facsFCs = facsMs
      .flatMap(m => m.derivedMetrics.filter(d => d.unit === 'facs_fc'))
      .map(d => d.value)
      .filter(v => v != null);

    const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const std  = arr => {
      if (arr.length < 2) return null;
      const m = mean(arr);
      return Math.sqrt(arr.map(x => (x - m) ** 2).reduce((a, b) => a + b, 0) / (arr.length - 1));
    };

    const meanHL   = mean(halfLives);
    const meanLFC  = mean(lysateFCs);
    const meanFACS = mean(facsFCs);

    if (meanHL == null && meanLFC == null && meanFACS == null) continue;

    records.push({
      sampleId:   v.name,
      mutation:   mut.notation,
      from_aa:    mut.from,
      to_aa:      mut.to,
      position:   mut.position,
      labels: {
        thermal_half_life_min:    meanHL   != null ? +meanHL.toFixed(3)   : null,
        thermal_half_life_fc:     meanHL   != null && wtKinetic > 0 ? +(meanHL / wtKinetic).toFixed(4) : null,
        lysate_fold_change:       meanLFC  != null ? +meanLFC.toFixed(4)  : null,
        facs_fold_change:         meanFACS != null ? +meanFACS.toFixed(4) : null,
        thermal_half_life_std:    std(halfLives)  != null ? +std(halfLives).toFixed(3)  : null,
        lysate_fc_std:            std(lysateFCs)  != null ? +std(lysateFCs).toFixed(4)  : null,
        facs_fc_std:              std(facsFCs)    != null ? +std(facsFCs).toFixed(4)    : null,
        n_kinetic_replicates:     halfLives.length,
        n_lysate_replicates:      lysateFCs.length,
        n_facs_replicates:        facsFCs.length,
      },
    });
  }

  return {
    exportedAt:    new Date().toISOString(),
    wtKinetic_hl:  wtKinetic,
    wtLysate_ref:  wtLysate,
    wtFACS_pct:    wtFACS,
    variants:      records,
  };
}

async function getWTHalfLife(experimentId) {
  const ms = await Measurement.find({
    experiment: experimentId,
    sampleType: 'REFERENCE',
    excluded: false,
  }).lean();

  const vals = ms
    .flatMap(m => m.derivedMetrics.filter(d => d.metricType === 'half_life'))
    .map(d => d.value)
    .filter(v => v != null && v > 0);

  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 10.0;
}

async function getWTLysateFoldChange(experimentId) {
  const ms = await Measurement.find({
    experiment: experimentId,
    sampleType: 'REFERENCE',
    excluded: false,
  }).lean();

  const vals = ms
    .flatMap(m => m.rawReadings.filter(r => r.fluorescence != null))
    .map(r => r.fluorescence);

  if (!vals.length) return 1;
  const rawMean = vals.reduce((a, b) => a + b, 0) / vals.length;

  // OD600 normalize
  const od600s = ms.map(m => m.metadata?.od600).filter(v => v != null && v > 0);
  const od600Mean = od600s.length ? od600s.reduce((a, b) => a + b, 0) / od600s.length : 1;
  return rawMean / od600Mean;
}

async function getWTFACSPct(experimentId) {
  const ms = await Measurement.find({
    experiment: experimentId,
    sampleType: 'REFERENCE',
    excluded: false,
  }).lean();

  const vals = ms
    .map(m => m.metadata?.pctFastPositive)
    .filter(v => v != null && v > 0);

  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 91.7;
}

main().catch(err => {
  console.error('\nImport failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
