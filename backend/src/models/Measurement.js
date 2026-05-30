const mongoose = require('mongoose');

// Embeds condition + raw readings + derived metrics in one document per sample/well
const rawReadingSchema = new mongoose.Schema({
  timepoint: { type: Number },      // null for endpoint assays
  fluorescence: { type: Number, required: true },
  unit: { type: String, default: 'RFU' },
}, { _id: false });

const derivedMetricSchema = new mongoose.Schema({
  metricType: {
    type: String,
    enum: ['apparent_tm', 'half_life', 'fold_change', 'rate_constant', 'ec50', 'other'],
    required: true,
  },
  value: { type: Number },
  unit: { type: String },
  confidenceLow: { type: Number },
  confidenceHigh: { type: Number },
  goodnessOfFit: { type: Number },
  analyticsVersion: { type: String, default: '1.0' },
  qcFlag: { type: String },
}, { _id: false, timestamps: { createdAt: 'computedAt', updatedAt: false } });

const measurementSchema = new mongoose.Schema({
  experiment: { type: mongoose.Schema.Types.ObjectId, ref: 'Experiment', required: true },
  upload: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload' },
  variant: { type: mongoose.Schema.Types.ObjectId, ref: 'Variant' },

  // Condition embedded directly
  condition: {
    temperature: { type: Number },
    ph: { type: Number },
    ionicStrength: { type: Number },
    solvent: { type: String },
    solventLoadingPct: { type: Number },
    incubationTimeMin: { type: Number },
  },

  wellPosition: { type: String },
  sampleType: {
    type: String,
    enum: ['VARIANT', 'NEGATIVE_CONTROL', 'POSITIVE_CONTROL', 'REFERENCE'],
    default: 'VARIANT',
  },
  replicateGroup: { type: String },

  rawReadings: [rawReadingSchema],
  derivedMetrics: [derivedMetricSchema],

  sampleId: { type: String },
  variantDescription: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

  qcFlags: [{ type: String }],
  excluded: { type: Boolean, default: false },
  excludeReason: { type: String },
}, { timestamps: true });

measurementSchema.index({ experiment: 1 });
measurementSchema.index({ variant: 1 });
measurementSchema.index({ 'condition.temperature': 1 });

module.exports = mongoose.model('Measurement', measurementSchema);
