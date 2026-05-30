const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const refreshTokenSchema = new mongoose.Schema({
  token: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: {
    type: String,
    enum: ['ADMIN', 'INTERNAL_SCIENTIST', 'INTERNAL_PROJECT_LEAD', 'EXTERNAL_CUSTOMER'],
    default: 'EXTERNAL_CUSTOMER',
  },
  tier: {
    type: String,
    enum: ['BRONZE', 'SILVER', 'GOLD'],
    default: 'BRONZE',
  },
  institution: { type: String, trim: true },
  org: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  isActive: { type: Boolean, default: true },
  refreshTokens: [refreshTokenSchema],
}, { timestamps: true });

// Never return passwordHash or refreshTokens in JSON responses
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.refreshTokens;
  return obj;
};

userSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = async (plain) => bcrypt.hash(plain, 12);

module.exports = mongoose.model('User', userSchema);
