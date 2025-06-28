const mongoose = require('mongoose');

const registerSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
      cashier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account', // the new cashier user
      required: false  // allow null for legacy sessions
    },
    managerRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: false
    },
    manager: {
      type: String,
      required: true  // for old compatibility
    },
  isOpen: {
    type: Boolean,
    default: false
  },
  openedAt: {
    type: Date
  },
  closedAt: {
    type: Date
  },
  startCash: {
    type: Number,
    required: true,
    default: 0
  },
  openingBalance: {
    type: Number,
    default: 0
  },
  closingBalance: {
    type: Number
  },
  expectedBalance: {
    type: Number
  },
  totalSales: {
    type: Number,
    default: 0
  },
    cashRecvd:{
    type: Number,
    default: 0
  },
  onlineRecvd:{
    type: Number,
    default: 0
  },
    expectedCash:{
    type: Number,
    default: 0
  },
  expectedOnline:{
    type: Number,
    default: 0
  },
  totalExpenses: {
    type: Number,
    default: 0
  },
  expenses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense'
  }],
  orders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }],
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Export the model with the MANAGERS constant for use in routes
module.exports = mongoose.model('Register', registerSchema)