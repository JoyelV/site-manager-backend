const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  refreshTokens: [
    { token: String, createdAt: { type: Date, default: Date.now } },
  ],
  // ──────────────────────────────────────
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  resetOtp: String,
  resetOtpExpires: Date,
});

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.matchPassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);