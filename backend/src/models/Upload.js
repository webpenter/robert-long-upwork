const mongoose = require('mongoose');

const uploadSchema = new mongoose.Schema({
  experiment: { type: mongoose.Schema.Types.ObjectId, ref: 'Experiment', required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fileName: { type: String, required: true },
  filePath: { type: String, required: true },
  fileSize: { type: Number },
  mimeType: { type: String },
  parseStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
  parseErrors: [{ type: String }],
  parsedRows: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Upload', uploadSchema);
