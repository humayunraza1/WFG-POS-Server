// models/Login.js
const mongoose = require('mongoose');

const loginSchema = new mongoose.Schema({
  accountRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true,
  },
  refreshToken: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 7 * 24 * 60 * 60 // 7 days
  }
});

module.exports = mongoose.model('Login', loginSchema);
