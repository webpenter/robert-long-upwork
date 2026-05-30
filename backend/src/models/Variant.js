const mongoose = require('mongoose');

const mutationSchema = new mongoose.Schema({
  position: { type: Number, required: true },
  from: { type: String, required: true, maxlength: 1 },
  to: { type: String, required: true, maxlength: 1 },
  notation: { type: String }, // e.g. "A123V"
}, { _id: false });

const variantSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  name: { type: String, required: true, trim: true },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Variant' },
  fastaSequence: { type: String },
  mutations: [mutationSchema],
  familyAnnotation: { type: String },
  structurePdbId: { type: String },
  structureSource: {
    type: String,
    enum: ['user_supplied', 'alphafold', 'esmfold'],
  },
}, { timestamps: true });

variantSchema.index({ project: 1 });
variantSchema.index({ 'mutations.position': 1 });

module.exports = mongoose.model('Variant', variantSchema);
