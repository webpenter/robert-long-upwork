const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
}, { timestamps: true });

module.exports = mongoose.model('Organization', organizationSchema);
