const mongoose = require('mongoose');

const experimentSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  name: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  operator: { type: String, trim: true },
  instrument: { type: String, trim: true },
  assayType: {
    type: String,
    enum: ['THERMAL', 'PH', 'SOLVENT', 'IONIC_STRENGTH', 'OTHER'],
    default: 'THERMAL',
  },
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('Experiment', experimentSchema);
