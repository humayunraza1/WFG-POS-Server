const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  registerSession: {
    type: String,
    required: true
  },
    branchCode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default:null
    },
  name: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  dateAdded: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Expense', expenseSchema); 