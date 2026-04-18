const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  customId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  assignedBranches: {
    type: [String],
    default: []
  },
  isPartnership: {
    type: Boolean,
    default: false
  },
  partnershipBusinessName: {
    type: String,
    trim: true,
    default: ''
  },
  partnershipSharePercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Category', categorySchema);
