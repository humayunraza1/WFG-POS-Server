const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const accountSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  password: {
    type: String,
    required: true,
    minlength: 1 // No password restrictions as requested
  },
  refreshTokens: [{
    token: String,
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 604800 // 7 days
    }
  }]
}, {
  timestamps: true
});

// Hash password before saving
accountSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
accountSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove refresh token method
accountSchema.methods.removeRefreshToken = function(tokenToRemove) {
  this.refreshTokens = this.refreshTokens.filter(tokenObj => tokenObj.token !== tokenToRemove);
  return this.save();
};

// Clean expired refresh tokens
accountSchema.methods.cleanExpiredTokens = function() {
  this.refreshTokens = this.refreshTokens.filter(tokenObj => 
    new Date() < new Date(tokenObj.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000)
  );
  return this.save();
};

module.exports = mongoose.model('Account', accountSchema);