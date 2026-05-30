const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  citations: [{ type: mongoose.Schema.Types.Mixed }],
}, { timestamps: true });

const candidateSchema = new mongoose.Schema({
  rank: { type: Number },
  mutation: { type: String },
  position: { type: Number },
  originalAa: { type: String },
  substitutedAa: { type: String },
  // Silver/Gold fields
  ddG: { type: Number },                     // kcal/mol, more negative = more stable
  predictedStabilityChange: { type: Number }, // dTm in °C
  confidenceLow: { type: Number },
  confidenceHigh: { type: Number },
  activityRisk: { type: Number },
  supportingVariants: { type: Number },
  structuralReason: { type: String },
}, { _id: false });

const hotspotSchema = new mongoose.Schema({
  position: { type: Number },
  residue: { type: String },
  mutationalTolerance: { type: Number },
  stabilizationPotential: { type: Number },
}, { _id: false });

const predictionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  variant: { type: mongoose.Schema.Types.ObjectId, ref: 'Variant' },
  modelVersion: { type: String, default: 'mock-v0.1' },

  fastaSequence: { type: String, required: true },
  conditions: {
    temperature: { type: Number },
    ph: { type: Number },
    solvent: { type: String },
    ionicStrength: { type: Number },
    solventLoadingPct: { type: Number },
  },
  constraints: { type: String },
  proposedMutations: [{ type: String }],
  tier: {
    type: String,
    enum: ['BRONZE', 'SILVER', 'GOLD'],
    required: true,
  },

  status: {
    type: String,
    enum: ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'],
    default: 'QUEUED',
  },
  errorMessage: { type: String },

  similarityWarning: { type: Boolean, default: false },
  similarityScore: { type: Number },

  // Results
  candidatesCount: { type: Number, default: 0 },
  candidates: [candidateSchema],
  hotspotMap: [hotspotSchema],

  completedAt: { type: Date },
  chatMessages: [chatMessageSchema],
}, { timestamps: true });

predictionSchema.index({ user: 1, createdAt: -1 });
predictionSchema.index({ project: 1 });
predictionSchema.index({ status: 1 });

module.exports = mongoose.model('Prediction', predictionSchema);
